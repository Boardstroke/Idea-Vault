"""
Main trainer class for spending forecast models.

Orchestrates:
- Data loading and preparation
- Model creation and training
- Evaluation (Transformer + Baselines)
- MLflow logging
"""

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional

import torch

from spending_forecast.config import (
    DATABASE_URL,
    SEQ_LEN,
    PRED_LEN,
    D_MODEL,
    NUM_LAYERS,
    BATCH_SIZE,
    LEARNING_RATE,
    EPOCHS,
    PATIENCE,
    DEFAULT_LOSS_TYPE,
    DEFAULT_POOLING,
    DEFAULT_MODEL_ARCH,
    MLFLOW_TRACKING_URI,
    MLFLOW_EXPERIMENT_NAME,
    MODEL_DIR,
    PRIMARY_METRIC,
)
from spending_forecast.data import (
    fetch_spending_data,
    prepare_data,
    create_sequences,
    create_dataloaders,
)
from spending_forecast.models.factory import create_model
from spending_forecast.eval import eval_transformer
from spending_forecast.eval.evaluator_baselines import log_baselines_to_mlflow
from spending_forecast.training.losses import get_loss_fn
from spending_forecast.training.loops import train_one_epoch, validate_one_epoch
from spending_forecast.training.checkpointing import save_checkpoint, load_checkpoint
from spending_forecast.training.mlflow_utils import (
    setup_mlflow,
    log_training_metrics,
    log_model_to_mlflow,
    log_evaluation_metrics,
)

logger = logging.getLogger(__name__)


class EarlyStopping:
    """Early stopping to prevent overfitting."""

    def __init__(self, patience: int = 5, min_delta: float = 0.001):
        self.patience = patience
        self.min_delta = min_delta
        self.counter = 0
        self.best_loss = None
        self.early_stop = False

    def __call__(self, val_loss: float) -> bool:
        if self.best_loss is None:
            self.best_loss = val_loss
        elif val_loss > self.best_loss - self.min_delta:
            self.counter += 1
            if self.counter >= self.patience:
                self.early_stop = True
        else:
            self.best_loss = val_loss
            self.counter = 0
        return self.early_stop


class ForecastTrainer:
    """
    Main trainer for spending forecast models.

    Features:
    - Supports V1 (pooling) and V2 (forecast tokens) architectures
    - Per-category normalization
    - Gaussian NLL or MSE loss
    - MLflow integration
    - Baseline comparison
    """

    def __init__(
        self,
        db_url: str = DATABASE_URL,
        model_dir: str = MODEL_DIR,
        seq_len: int = SEQ_LEN,
        pred_len: int = PRED_LEN,
        d_model: int = D_MODEL,
        num_layers: int = NUM_LAYERS,
        batch_size: int = BATCH_SIZE,
        learning_rate: float = LEARNING_RATE,
        epochs: int = EPOCHS,
        patience: int = PATIENCE,
        loss_type: str = DEFAULT_LOSS_TYPE,
        model_arch: str = DEFAULT_MODEL_ARCH,
        pooling_type: str = DEFAULT_POOLING,
        mlflow_tracking_uri: str = MLFLOW_TRACKING_URI,
        experiment_name: str = MLFLOW_EXPERIMENT_NAME,
        device: Optional[str] = None,
    ):
        self.db_url = db_url
        self.model_dir = Path(model_dir)
        self.model_dir.mkdir(parents=True, exist_ok=True)

        # Architecture
        self.seq_len = seq_len
        self.pred_len = pred_len
        self.d_model = d_model
        self.num_layers = num_layers
        self.model_arch = model_arch
        self.pooling_type = pooling_type

        # Training
        self.batch_size = batch_size
        self.learning_rate = learning_rate
        self.epochs = epochs
        self.patience = patience
        self.loss_type = loss_type

        # MLflow
        self.mlflow_tracking_uri = mlflow_tracking_uri
        self.experiment_name = experiment_name
        self.mlflow_active = setup_mlflow(mlflow_tracking_uri, experiment_name)

        # Device
        if device:
            self.device = torch.device(device)
        else:
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        logger.info(f"Using device: {self.device}")

        # State
        self.model = None
        self.model_version = datetime.now().strftime("v%Y%m%d_%H%M%S")
        self.category_mapping = {}
        self.reverse_category_mapping = {}
        self.scaler_params = {}

    def run(self, with_baselines: bool = False) -> Dict[str, Any]:
        """
        Execute full training pipeline.

        Args:
            with_baselines: If True, also log baselines to MLflow for comparison

        Returns:
            Dict with model_version, metrics, paths
        """
        import mlflow

        logger.info("=" * 50)
        logger.info("Starting Forecast Transformer Training Pipeline")
        logger.info(f"Model: {self.model_arch} | Loss: {self.loss_type}")
        logger.info("=" * 50)

        # Start MLflow run
        mlflow_run = None
        if self.mlflow_active:
            try:
                mlflow_run = mlflow.start_run(run_name=self.model_version)
                mlflow.log_params(
                    {
                        "model_arch": self.model_arch,
                        "seq_len": self.seq_len,
                        "pred_len": self.pred_len,
                        "d_model": self.d_model,
                        "num_layers": self.num_layers,
                        "batch_size": self.batch_size,
                        "learning_rate": self.learning_rate,
                        "epochs": self.epochs,
                        "patience": self.patience,
                        "loss_type": self.loss_type,
                        "pooling_type": self.pooling_type
                        if self.model_arch == "v1"
                        else "N/A",
                        "device": str(self.device),
                    }
                )
            except Exception as e:
                logger.warning(f"Could not start MLflow run: {e}")

        try:
            # 1. Fetch data
            df = fetch_spending_data(self.db_url)

            if len(df) < 20:
                raise ValueError(f"Not enough data: {len(df)} records")

            # 2. Prepare data
            df, self.category_mapping, self.scaler_params = prepare_data(df)
            self.reverse_category_mapping = {
                v: k for k, v in self.category_mapping.items()
            }

            # 3. Create sequences
            sequences = create_sequences(
                df, self.category_mapping, self.seq_len, self.pred_len
            )

            # 4. Create dataloaders
            train_loader, val_loader, train_seqs, val_seqs = create_dataloaders(
                sequences, self.batch_size
            )

            if self.mlflow_active:
                mlflow.log_params(
                    {
                        "n_records": len(df),
                        "n_categories": len(self.category_mapping),
                        "n_sequences": len(sequences),
                        "n_train": len(train_seqs),
                        "n_val": len(val_seqs),
                    }
                )

            # 5. Create model
            n_categories = len(self.category_mapping)
            self.model = create_model(
                model_arch=self.model_arch,
                n_categories=n_categories,
                seq_len=self.seq_len,
                pred_len=self.pred_len,
                d_model=self.d_model,
                num_layers=self.num_layers,
                pooling_type=self.pooling_type,
            ).to(self.device)

            # 6. Train
            metrics = self._train_loop(train_loader, val_loader)

            # 7. Evaluate on validation set (in BRL scale!)
            eval_metrics = eval_transformer(
                model=self.model,
                dataloader=val_loader,
                device=self.device,
                reverse_category_mapping=self.reverse_category_mapping,
                scaler_params=self.scaler_params,
                return_uncertainty=(self.loss_type == "gaussian_nll"),
            )

            logger.info(f"Evaluation metrics (BRL): MAE={eval_metrics['mae_brl']:.2f}")

            # 8. Log final metrics to MLflow
            if self.mlflow_active:
                mlflow.log_metrics(
                    {
                        "final_train_loss": metrics["train_loss"],
                        "final_val_loss": metrics["val_loss"],
                        "epochs_trained": metrics["epochs_trained"],
                    }
                )
                log_evaluation_metrics(eval_metrics)

                # Log primary metric for comparison
                mlflow.log_metric(PRIMARY_METRIC, eval_metrics.get("mae_brl", 0))

            # 9. Save model
            model_path = self._save_model()

            # 10. Log model to MLflow
            if self.mlflow_active:
                log_model_to_mlflow(
                    self.model,
                    model_path,
                    self.model_dir / "forecast_metadata.json",
                )

            logger.info("=" * 50)
            logger.info("Training Complete!")
            logger.info(f"MAE (BRL): {eval_metrics['mae_brl']:.2f}")
            logger.info("=" * 50)

            result = {
                "model_version": self.model_version,
                "model_path": str(model_path),
                "train_metrics": metrics,
                "eval_metrics": eval_metrics,
                "category_mapping": self.category_mapping,
                "scaler_params": self.scaler_params,
            }

            if mlflow_run:
                result["mlflow_run_id"] = mlflow_run.info.run_id

            return result

        finally:
            if self.mlflow_active:
                mlflow.end_run()

            # Log baselines AFTER the main run ends (separate runs)
            if with_baselines:
                self._log_baselines(val_seqs)

    def _train_loop(self, train_loader, val_loader) -> Dict[str, Any]:
        """Execute training loop."""
        use_uncertainty = self.loss_type == "gaussian_nll"
        criterion = get_loss_fn(self.loss_type)

        optimizer = torch.optim.AdamW(
            self.model.parameters(),
            lr=self.learning_rate,
            weight_decay=0.01,
        )
        scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
            optimizer, mode="min", factor=0.5, patience=5
        )
        early_stopping = EarlyStopping(patience=self.patience)

        best_val_loss = float("inf")
        history = {"train_loss": [], "val_loss": []}

        for epoch in range(self.epochs):
            # Train
            train_loss = train_one_epoch(
                self.model,
                train_loader,
                optimizer,
                criterion,
                self.device,
                use_uncertainty,
            )

            # Validate
            val_result = validate_one_epoch(
                self.model, val_loader, criterion, self.device, use_uncertainty
            )
            val_loss = val_result["loss"]

            history["train_loss"].append(train_loss)
            history["val_loss"].append(val_loss)

            # Log to MLflow
            log_training_metrics(
                train_loss,
                val_loss,
                val_result["mae_norm"],
                optimizer.param_groups[0]["lr"],
                epoch,
            )

            scheduler.step(val_loss)

            if val_loss < best_val_loss:
                best_val_loss = val_loss
                self._save_checkpoint("best")

            if (epoch + 1) % 10 == 0:
                logger.info(
                    f"Epoch {epoch + 1}/{self.epochs} - "
                    f"Train: {train_loss:.4f}, Val: {val_loss:.4f}"
                )

            if early_stopping(val_loss):
                logger.info(f"Early stopping at epoch {epoch + 1}")
                break

        # Load best model
        self._load_checkpoint("best")

        return {
            "train_loss": float(history["train_loss"][-1]),
            "val_loss": float(best_val_loss),
            "epochs_trained": len(history["train_loss"]),
        }

    def _save_checkpoint(self, name: str):
        """Save training checkpoint."""
        path = self.model_dir / f"forecast_{name}.pt"
        save_checkpoint(
            self.model,
            path,
            model_config={
                "model_arch": self.model_arch,
                "n_categories": len(self.category_mapping),
                "seq_len": self.seq_len,
                "pred_len": self.pred_len,
                "d_model": self.d_model,
                "num_layers": self.num_layers,
                "pooling_type": self.pooling_type,
            },
        )

    def _load_checkpoint(self, name: str):
        """Load training checkpoint."""
        path = self.model_dir / f"forecast_{name}.pt"
        load_checkpoint(path, self.model, self.device)

    def _save_model(self) -> Path:
        """Save final model."""
        model_config = {
            "model_arch": self.model_arch,
            "n_categories": len(self.category_mapping),
            "seq_len": self.seq_len,
            "pred_len": self.pred_len,
            "d_model": self.d_model,
            "num_layers": self.num_layers,
            "pooling_type": self.pooling_type,
        }

        # Save versioned checkpoint
        model_path = self.model_dir / f"forecast_transformer_{self.model_version}.pt"
        save_checkpoint(
            self.model,
            model_path,
            model_config,
            extra_data={
                "category_mapping": self.category_mapping,
                "reverse_category_mapping": self.reverse_category_mapping,
                "scaler_params": self.scaler_params,
            },
        )

        # Save as latest
        latest_path = self.model_dir / "forecast_transformer_latest.pt"
        save_checkpoint(
            self.model,
            latest_path,
            model_config,
            extra_data={
                "category_mapping": self.category_mapping,
                "reverse_category_mapping": self.reverse_category_mapping,
                "scaler_params": self.scaler_params,
            },
        )

        # Save metadata JSON
        metadata = {
            "version": self.model_version,
            "model_arch": self.model_arch,
            "seq_len": self.seq_len,
            "pred_len": self.pred_len,
            "d_model": self.d_model,
            "num_layers": self.num_layers,
            "pooling_type": self.pooling_type,
            "loss_type": self.loss_type,
            "n_categories": len(self.category_mapping),
            "category_mapping": self.category_mapping,
            "created_at": datetime.now().isoformat(),
        }

        metadata_path = self.model_dir / "forecast_metadata.json"
        with open(metadata_path, "w") as f:
            json.dump(metadata, f, indent=2)

        logger.info(f"Model saved: {model_path}")
        return model_path

    def _log_baselines(self, val_sequences):
        """Log baselines to MLflow for comparison."""
        try:
            log_baselines_to_mlflow(
                sequences=val_sequences,
                seq_len=self.seq_len,
                pred_len=self.pred_len,
                scaler_params=self.scaler_params,
                reverse_category_mapping=self.reverse_category_mapping,
                experiment_name=self.experiment_name,
                primary_metric=PRIMARY_METRIC,
            )
        except Exception as e:
            logger.warning(f"Could not log baselines: {e}")
