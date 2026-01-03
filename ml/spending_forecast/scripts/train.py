#!/usr/bin/env python3
"""
CLI for training spending forecast models.

Usage:
    python -m spending_forecast.scripts.train --model-arch v1 --with-baselines
    python -m spending_forecast.scripts.train --model-arch v2 --epochs 50
"""

import argparse
import os
import sys
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

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
)
from spending_forecast.utils import setup_logging, set_seed
from spending_forecast.training import ForecastTrainer


def parse_args():
    parser = argparse.ArgumentParser(
        description="Train Spending Forecast Model",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    
    # Database
    parser.add_argument(
        "--db-url",
        default=os.getenv("DATABASE_URL", DATABASE_URL),
        help="Database connection URL",
    )
    
    # Model directory
    parser.add_argument(
        "--model-dir",
        default=os.getenv("MODEL_DIR", MODEL_DIR),
        help="Directory to save models",
    )
    
    # Architecture
    parser.add_argument(
        "--model-arch",
        choices=["v1", "v2"],
        default=os.getenv("MODEL_ARCH", DEFAULT_MODEL_ARCH),
        help="Model architecture: v1 (pooling) or v2 (forecast tokens)",
    )
    parser.add_argument(
        "--seq-len",
        type=int,
        default=int(os.getenv("SEQ_LEN", str(SEQ_LEN))),
        help="Input sequence length (months)",
    )
    parser.add_argument(
        "--pred-len",
        type=int,
        default=int(os.getenv("PRED_LEN", str(PRED_LEN))),
        help="Prediction length (months)",
    )
    parser.add_argument(
        "--d-model",
        type=int,
        default=int(os.getenv("D_MODEL", str(D_MODEL))),
        help="Model dimension",
    )
    parser.add_argument(
        "--num-layers",
        type=int,
        default=int(os.getenv("NUM_LAYERS", str(NUM_LAYERS))),
        help="Number of transformer layers",
    )
    parser.add_argument(
        "--pooling-type",
        choices=["attention", "flatten", "cls"],
        default=os.getenv("POOLING_TYPE", DEFAULT_POOLING),
        help="Pooling strategy (V1 only)",
    )
    
    # Training
    parser.add_argument(
        "--epochs",
        type=int,
        default=int(os.getenv("EPOCHS", str(EPOCHS))),
        help="Maximum training epochs",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=int(os.getenv("BATCH_SIZE", str(BATCH_SIZE))),
        help="Training batch size",
    )
    parser.add_argument(
        "--learning-rate",
        type=float,
        default=float(os.getenv("LEARNING_RATE", str(LEARNING_RATE))),
        help="Learning rate",
    )
    parser.add_argument(
        "--patience",
        type=int,
        default=int(os.getenv("PATIENCE", str(PATIENCE))),
        help="Early stopping patience",
    )
    parser.add_argument(
        "--loss-type",
        choices=["gaussian_nll", "mse"],
        default=os.getenv("LOSS_TYPE", DEFAULT_LOSS_TYPE),
        help="Loss function type",
    )
    
    # MLflow
    parser.add_argument(
        "--mlflow-uri",
        default=os.getenv("MLFLOW_TRACKING_URI", MLFLOW_TRACKING_URI),
        help="MLflow tracking URI",
    )
    parser.add_argument(
        "--experiment-name",
        default=os.getenv("MLFLOW_EXPERIMENT", MLFLOW_EXPERIMENT_NAME),
        help="MLflow experiment name",
    )
    
    # Baselines
    parser.add_argument(
        "--with-baselines",
        action="store_true",
        default=os.getenv("WITH_BASELINES", "false").lower() == "true",
        help="Log baselines to MLflow for comparison",
    )
    
    # Misc
    parser.add_argument(
        "--seed",
        type=int,
        default=int(os.getenv("SEED", "42")),
        help="Random seed",
    )
    parser.add_argument(
        "--device",
        default=os.getenv("DEVICE", None),
        help="Device (cpu, cuda, cuda:0, etc.)",
    )
    
    return parser.parse_args()


def main():
    args = parse_args()
    
    # Setup
    setup_logging()
    set_seed(args.seed)
    
    # Create trainer
    trainer = ForecastTrainer(
        db_url=args.db_url,
        model_dir=args.model_dir,
        seq_len=args.seq_len,
        pred_len=args.pred_len,
        d_model=args.d_model,
        num_layers=args.num_layers,
        batch_size=args.batch_size,
        learning_rate=args.learning_rate,
        epochs=args.epochs,
        patience=args.patience,
        loss_type=args.loss_type,
        model_arch=args.model_arch,
        pooling_type=args.pooling_type,
        mlflow_tracking_uri=args.mlflow_uri,
        experiment_name=args.experiment_name,
        device=args.device,
    )
    
    # Train
    result = trainer.run(with_baselines=args.with_baselines)
    
    # Print results
    print("\n" + "=" * 50)
    print("✅ Training Complete!")
    print("=" * 50)
    print(f"Model Version: {result['model_version']}")
    print(f"Model Arch: {args.model_arch}")
    print(f"Loss Type: {args.loss_type}")
    print(f"\nTraining Metrics:")
    print(f"  Train Loss: {result['train_metrics']['train_loss']:.4f}")
    print(f"  Val Loss: {result['train_metrics']['val_loss']:.4f}")
    print(f"  Epochs: {result['train_metrics']['epochs_trained']}")
    print(f"\nEvaluation Metrics (BRL):")
    print(f"  MAE: R$ {result['eval_metrics']['mae_brl']:.2f}")
    print(f"  RMSE: R$ {result['eval_metrics']['rmse_brl']:.2f}")
    print(f"  WAPE: {result['eval_metrics']['wape']:.2%}")
    print(f"\nModel saved to: {result['model_path']}")
    
    if "mlflow_run_id" in result:
        print(f"MLflow Run ID: {result['mlflow_run_id']}")
    
    if args.with_baselines:
        print(f"\n📊 Baselines logged to MLflow - compare at: {args.mlflow_uri}")


if __name__ == "__main__":
    main()

