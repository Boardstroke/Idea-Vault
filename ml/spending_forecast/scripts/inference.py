# spending_forecast/scripts/inference.py
"""
CLI script for running batch inference.
"""

import argparse
import os
import logging

from spending_forecast.inference import BatchInference, BatchInferenceConfig
from spending_forecast.utils.logging import setup_logging

logger = setup_logging(__name__)


def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Run Spending Forecast batch inference"
    )

    parser.add_argument(
        "--model-dir",
        default=os.getenv("MODEL_DIR", "../models"),
        help="Directory containing model files",
    )
    parser.add_argument(
        "--model-path",
        default=None,
        help="Direct path to model checkpoint (overrides model-dir)",
    )
    parser.add_argument(
        "--db-url",
        default=os.getenv(
            "DATABASE_URL",
            "postgresql://dbt_user:dbt_password@localhost:5433/dbt_medallion",
        ),
        help="Database connection URL",
    )
    parser.add_argument(
        "--categories",
        nargs="+",
        default=None,
        help="Categories to process (default: all)",
    )
    parser.add_argument(
        "--history-months",
        type=int,
        default=6,
        help="Months of history to use",
    )
    parser.add_argument(
        "--write-to-db",
        action="store_true",
        default=False,
        help="Write results to database",
    )
    parser.add_argument(
        "--output-format",
        choices=["table", "json", "summary"],
        default="summary",
        help="Output format",
    )

    return parser.parse_args()


def print_results_table(predictions):
    """Print predictions as a formatted table."""
    print("\n" + "=" * 80)
    print(f"{'Categoria':<20} {'Mês':<12} {'Previsão':>12} {'Min':>12} {'Max':>12}")
    print("-" * 80)

    for p in predictions:
        print(
            f"{p['categoria']:<20} "
            f"{p['mes_referencia']:<12} "
            f"R$ {p['valor_previsto']:>9.2f} "
            f"R$ {p['intervalo_inferior']:>9.2f} "
            f"R$ {p['intervalo_superior']:>9.2f}"
        )

    print("=" * 80)


def print_results_json(predictions):
    """Print predictions as JSON."""
    import json

    print(json.dumps(predictions, indent=2, ensure_ascii=False))


def print_results_summary(result):
    """Print summary of results."""
    print("\n" + "=" * 60)
    print("📊 Inferência Batch Completa!")
    print("=" * 60)
    print(f"  Modelo: {result.model_arch} v{result.model_version}")
    print(f"  Categorias processadas: {result.categories_processed}")
    print(f"  Previsões geradas: {len(result.predictions)}")
    print(f"  Linhas escritas no DB: {result.rows_written}")
    print(f"  Tempo de execução: {result.execution_time_seconds:.2f}s")

    if result.errors:
        print(f"\n⚠️  Erros: {len(result.errors)}")
        for e in result.errors[:3]:
            print(f"    - {e}")

    # Show sample predictions
    if result.predictions:
        print("\n📈 Exemplos de previsões:")
        seen_cats = set()
        for p in result.predictions:
            if p["categoria"] not in seen_cats and len(seen_cats) < 3:
                seen_cats.add(p["categoria"])
                print(
                    f"    {p['categoria']}: R$ {p['valor_previsto']:.2f} "
                    f"({p['mes_referencia']}) "
                    f"[R$ {p['intervalo_inferior']:.2f} - R$ {p['intervalo_superior']:.2f}]"
                )

    print("=" * 60)


def main():
    """Main entry point."""
    args = parse_args()

    # Configure
    config = BatchInferenceConfig(
        db_url=args.db_url,
        model_path=args.model_path,
        model_dir=args.model_dir,
        history_months=args.history_months,
        categories=args.categories,
        write_to_db=args.write_to_db,
    )

    # Run inference
    batch = BatchInference(config)
    result = batch.run()

    # Output results
    if args.output_format == "table":
        print_results_table(result.predictions)
    elif args.output_format == "json":
        print_results_json(result.predictions)
    else:
        print_results_summary(result)

    # Return exit code
    return 0 if not result.errors else 1


if __name__ == "__main__":
    exit(main())
