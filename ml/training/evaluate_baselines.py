"""
Baseline Evaluation for Spending Forecast

Compara o modelo Transformer contra baselines simples:
1. Last Value: repete o último valor observado
2. Moving Average: média dos últimos N meses
3. Seasonal Naive: valor do mesmo mês do ano anterior (se disponível)

Métricas: MAE, RMSE, MAPE
"""

import os
import logging
import argparse
from pathlib import Path
from typing import Dict, Any, List, Tuple

import numpy as np
import pandas as pd
import torch
from sqlalchemy import create_engine

# Add parent directory to path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from models.forecast_transformer import create_model

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class BaselineModels:
    """Collection of baseline forecasting methods."""

    @staticmethod
    def last_value(history: np.ndarray, pred_len: int) -> np.ndarray:
        """
        Baseline: Repete o último valor observado.
        
        Args:
            history: Array de valores históricos
            pred_len: Número de passos a prever
            
        Returns:
            Array com previsões (último valor repetido)
        """
        return np.full(pred_len, history[-1])

    @staticmethod
    def moving_average(history: np.ndarray, pred_len: int, window: int = 3) -> np.ndarray:
        """
        Baseline: Média móvel dos últimos N meses.
        
        Args:
            history: Array de valores históricos
            pred_len: Número de passos a prever
            window: Tamanho da janela para média
            
        Returns:
            Array com previsões (média repetida)
        """
        avg = np.mean(history[-window:])
        return np.full(pred_len, avg)

    @staticmethod
    def linear_trend(history: np.ndarray, pred_len: int) -> np.ndarray:
        """
        Baseline: Extrapolação linear simples.
        
        Args:
            history: Array de valores históricos
            pred_len: Número de passos a prever
            
        Returns:
            Array com previsões seguindo tendência linear
        """
        x = np.arange(len(history))
        slope, intercept = np.polyfit(x, history, 1)
        future_x = np.arange(len(history), len(history) + pred_len)
        return slope * future_x + intercept

    @staticmethod
    def exponential_smoothing(
        history: np.ndarray, pred_len: int, alpha: float = 0.3
    ) -> np.ndarray:
        """
        Baseline: Suavização exponencial simples.
        
        Args:
            history: Array de valores históricos
            pred_len: Número de passos a prever
            alpha: Fator de suavização (0-1)
            
        Returns:
            Array com previsões
        """
        # Calcular valor suavizado
        smoothed = history[0]
        for val in history[1:]:
            smoothed = alpha * val + (1 - alpha) * smoothed
        return np.full(pred_len, smoothed)


class ForecastEvaluator:
    """Avalia e compara modelo Transformer com baselines."""

    def __init__(
        self,
        db_url: str,
        model_path: str = None,
        seq_len: int = 6,
        pred_len: int = 3,
    ):
        self.db_url = db_url
        self.model_path = model_path
        self.seq_len = seq_len
        self.pred_len = pred_len
        self.engine = create_engine(db_url)
        
        self.model = None
        self.model_config = None
        self.category_mapping = None
        self.scaler_params = None

    def load_model(self) -> bool:
        """Carrega o modelo treinado."""
        if self.model_path is None:
            model_path = Path(__file__).parent.parent / "models" / "forecast_transformer_latest.pt"
        else:
            model_path = Path(self.model_path)

        if not model_path.exists():
            logger.warning(f"Model not found at {model_path}")
            return False

        logger.info(f"Loading model from {model_path}")
        checkpoint = torch.load(model_path, map_location="cpu")

        self.model_config = checkpoint["model_config"]
        self.category_mapping = checkpoint["category_mapping"]
        self.scaler_params = checkpoint["scaler_params"]

        self.model = create_model(**self.model_config)
        self.model.load_state_dict(checkpoint["model_state_dict"])
        self.model.eval()

        logger.info(f"Model loaded with {len(self.category_mapping)} categories")
        return True

    def fetch_data(self) -> pd.DataFrame:
        """Busca dados para avaliação."""
        query = """
        SELECT 
            ano_mes,
            categoria_nome as categoria,
            total_gasto as valor_total,
            mes
        FROM gold.gld_gastos_categoria
        WHERE total_gasto > 0
        ORDER BY categoria_nome, ano_mes
        """
        return pd.read_sql(query, self.engine)

    def create_test_sequences(
        self, df: pd.DataFrame
    ) -> List[Dict[str, Any]]:
        """Cria sequências de teste."""
        sequences = []

        for categoria in df["categoria"].unique():
            cat_data = df[df["categoria"] == categoria].sort_values("ano_mes")

            if len(cat_data) < self.seq_len + self.pred_len:
                continue

            values = cat_data["valor_total"].values
            months = cat_data["mes"].values

            # Criar sequências de teste (sliding window)
            for i in range(len(values) - self.seq_len - self.pred_len + 1):
                history = values[i : i + self.seq_len]
                actual = values[i + self.seq_len : i + self.seq_len + self.pred_len]
                history_months = months[i : i + self.seq_len]

                sequences.append({
                    "categoria": categoria,
                    "history": history,
                    "actual": actual,
                    "months": history_months,
                })

        return sequences

    def predict_transformer(
        self, history: np.ndarray, categoria: str, months: np.ndarray
    ) -> np.ndarray:
        """Faz previsão com o modelo Transformer."""
        if self.model is None:
            return np.full(self.pred_len, np.nan)

        # Normalizar
        cat_params = self.scaler_params.get(categoria, self.scaler_params.get("_global"))
        history_norm = (history - cat_params["mean"]) / cat_params["std"]
        
        # Calcular tendência
        trends = np.diff(history_norm, prepend=history_norm[0])

        # Preparar inputs
        x = torch.tensor(
            np.stack([history_norm, trends], axis=-1)[np.newaxis], dtype=torch.float32
        )
        cat_id = self.category_mapping.get(categoria, 0)
        categories = torch.tensor([[cat_id] * self.seq_len], dtype=torch.int64)
        months_tensor = torch.tensor([months.astype(int)], dtype=torch.int64)

        # Prever
        with torch.no_grad():
            predictions, _ = self.model(x, categories, months_tensor)

        # Desnormalizar
        preds = predictions.numpy()[0] * cat_params["std"] + cat_params["mean"]
        return np.clip(preds, 0, None)

    def evaluate(self) -> Dict[str, Dict[str, float]]:
        """Avalia todos os modelos."""
        logger.info("Fetching data...")
        df = self.fetch_data()

        logger.info("Creating test sequences...")
        sequences = self.create_test_sequences(df)
        logger.info(f"Created {len(sequences)} test sequences")

        if len(sequences) == 0:
            raise ValueError("No test sequences created")

        # Resultados por modelo
        results = {
            "last_value": {"mae": [], "rmse": [], "mape": []},
            "moving_avg_3": {"mae": [], "rmse": [], "mape": []},
            "linear_trend": {"mae": [], "rmse": [], "mape": []},
            "exp_smoothing": {"mae": [], "rmse": [], "mape": []},
        }

        if self.model is not None:
            results["transformer"] = {"mae": [], "rmse": [], "mape": []}

        # Avaliar cada sequência
        for seq in sequences:
            history = seq["history"]
            actual = seq["actual"]
            categoria = seq["categoria"]
            months = seq["months"]

            # Baselines
            pred_last = BaselineModels.last_value(history, self.pred_len)
            pred_ma3 = BaselineModels.moving_average(history, self.pred_len, window=3)
            pred_linear = BaselineModels.linear_trend(history, self.pred_len)
            pred_exp = BaselineModels.exponential_smoothing(history, self.pred_len)

            predictions = {
                "last_value": pred_last,
                "moving_avg_3": pred_ma3,
                "linear_trend": pred_linear,
                "exp_smoothing": pred_exp,
            }

            # Transformer
            if self.model is not None:
                pred_transformer = self.predict_transformer(history, categoria, months)
                predictions["transformer"] = pred_transformer

            # Calcular métricas
            for model_name, preds in predictions.items():
                mae = np.mean(np.abs(actual - preds))
                rmse = np.sqrt(np.mean((actual - preds) ** 2))
                # MAPE com proteção contra divisão por zero
                mape = np.mean(np.abs((actual - preds) / np.maximum(actual, 1))) * 100

                results[model_name]["mae"].append(mae)
                results[model_name]["rmse"].append(rmse)
                results[model_name]["mape"].append(mape)

        # Agregar resultados
        summary = {}
        for model_name, metrics in results.items():
            summary[model_name] = {
                "mae": float(np.mean(metrics["mae"])),
                "mae_std": float(np.std(metrics["mae"])),
                "rmse": float(np.mean(metrics["rmse"])),
                "rmse_std": float(np.std(metrics["rmse"])),
                "mape": float(np.mean(metrics["mape"])),
                "mape_std": float(np.std(metrics["mape"])),
            }

        return summary

    def print_results(self, results: Dict[str, Dict[str, float]]):
        """Imprime resultados formatados."""
        print("\n" + "=" * 70)
        print("AVALIAÇÃO DE BASELINES vs TRANSFORMER")
        print("=" * 70)
        print(f"\nSequence length: {self.seq_len} meses")
        print(f"Prediction length: {self.pred_len} meses")
        print("\n" + "-" * 70)
        print(f"{'Modelo':<20} {'MAE':>12} {'RMSE':>12} {'MAPE (%)':>12}")
        print("-" * 70)

        # Ordenar por MAE
        sorted_results = sorted(results.items(), key=lambda x: x[1]["mae"])

        for model_name, metrics in sorted_results:
            mae = f"{metrics['mae']:.2f} ± {metrics['mae_std']:.2f}"
            rmse = f"{metrics['rmse']:.2f} ± {metrics['rmse_std']:.2f}"
            mape = f"{metrics['mape']:.1f} ± {metrics['mape_std']:.1f}"
            print(f"{model_name:<20} {mae:>12} {rmse:>12} {mape:>12}")

        print("-" * 70)

        # Comparativo com melhor baseline
        if "transformer" in results:
            best_baseline = min(
                [(k, v) for k, v in results.items() if k != "transformer"],
                key=lambda x: x[1]["mae"],
            )
            transformer_mae = results["transformer"]["mae"]
            baseline_mae = best_baseline[1]["mae"]
            improvement = (baseline_mae - transformer_mae) / baseline_mae * 100

            print(f"\n📊 Comparativo:")
            print(f"   Melhor baseline: {best_baseline[0]} (MAE: {baseline_mae:.2f})")
            print(f"   Transformer: MAE {transformer_mae:.2f}")
            if improvement > 0:
                print(f"   ✅ Transformer é {improvement:.1f}% melhor que o baseline")
            else:
                print(f"   ⚠️  Baseline é {-improvement:.1f}% melhor que o Transformer")
        
        print()


def main():
    parser = argparse.ArgumentParser(description="Evaluate forecast models against baselines")
    parser.add_argument(
        "--db-url",
        default=os.getenv(
            "DATABASE_URL",
            "postgresql://dbt_user:dbt_password@localhost:5433/dbt_medallion",
        ),
    )
    parser.add_argument("--model-path", default=None, help="Path to trained model")
    parser.add_argument("--seq-len", type=int, default=6)
    parser.add_argument("--pred-len", type=int, default=3)

    args = parser.parse_args()

    evaluator = ForecastEvaluator(
        db_url=args.db_url,
        model_path=args.model_path,
        seq_len=args.seq_len,
        pred_len=args.pred_len,
    )

    # Carregar modelo (opcional)
    model_loaded = evaluator.load_model()
    if not model_loaded:
        logger.warning("Running evaluation with baselines only (no Transformer model)")

    # Avaliar
    results = evaluator.evaluate()

    # Mostrar resultados
    evaluator.print_results(results)


if __name__ == "__main__":
    main()

