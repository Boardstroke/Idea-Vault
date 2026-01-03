"""
Start Forecast Workflows

Utility script to trigger forecast training or inference workflows.
"""

import asyncio
import argparse
import logging

from temporalio.client import Client

from workflows.forecast_train_workflow import (
    ForecastTrainWorkflow,
    ForecastTrainWorkflowInput,
)
from workflows.forecast_inference_workflow import (
    ForecastInferenceWorkflow,
    ForecastInferenceWorkflowInput,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def start_train_workflow(client: Client, args):
    """Start the forecast training workflow."""
    logger.info("Starting ForecastTrainWorkflow...")
    
    handle = await client.start_workflow(
        ForecastTrainWorkflow.run,
        ForecastTrainWorkflowInput(
            min_months=args.min_months,
            d_model=args.d_model,
            num_layers=args.num_layers,
            epochs=args.epochs,
            batch_size=args.batch_size,
            deploy_to_kserve=args.deploy,
        ),
        id=f"forecast-train-{args.run_id}",
        task_queue="ml-pipeline",
    )
    
    logger.info(f"Started workflow: {handle.id}")
    
    if args.wait:
        logger.info("Waiting for workflow to complete...")
        result = await handle.result()
        logger.info(f"Training complete!")
        logger.info(f"  Model version: {result.model_version}")
        logger.info(f"  Val loss: {result.metrics['val_loss']:.4f}")
        logger.info(f"  Deployed: {result.deployed}")
        return result
    
    return handle


async def start_inference_workflow(client: Client, args):
    """Start the forecast inference workflow."""
    logger.info("Starting ForecastInferenceWorkflow...")
    
    categories = args.categories.split(',') if args.categories else None
    
    handle = await client.start_workflow(
        ForecastInferenceWorkflow.run,
        ForecastInferenceWorkflowInput(
            categories=categories,
            history_months=args.history_months,
            write_to_db=args.save,
        ),
        id=f"forecast-inference-{args.run_id}",
        task_queue="ml-pipeline",
    )
    
    logger.info(f"Started workflow: {handle.id}")
    
    if args.wait:
        logger.info("Waiting for workflow to complete...")
        result = await handle.result()
        logger.info(f"Inference complete!")
        logger.info(f"  Predictions: {len(result.predictions)}")
        logger.info(f"  Rows written: {result.rows_written}")
        return result
    
    return handle


async def main():
    parser = argparse.ArgumentParser(description="Start Forecast Workflows")
    parser.add_argument(
        "command",
        choices=["train", "inference"],
        help="Workflow to run"
    )
    parser.add_argument(
        "--run-id",
        default="manual",
        help="Unique run identifier"
    )
    parser.add_argument(
        "--wait",
        action="store_true",
        help="Wait for workflow to complete"
    )
    parser.add_argument(
        "--temporal-host",
        default="localhost:7233",
        help="Temporal server address"
    )
    
    # Train arguments
    parser.add_argument("--min-months", type=int, default=9)
    parser.add_argument("--d-model", type=int, default=64)
    parser.add_argument("--num-layers", type=int, default=2)
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--deploy", action="store_true")
    
    # Inference arguments
    parser.add_argument("--categories", type=str, default=None)
    parser.add_argument("--history-months", type=int, default=6)
    parser.add_argument("--save", action="store_true", default=True)
    
    args = parser.parse_args()
    
    # Connect to Temporal
    client = await Client.connect(args.temporal_host)
    
    if args.command == "train":
        await start_train_workflow(client, args)
    else:
        await start_inference_workflow(client, args)


if __name__ == "__main__":
    asyncio.run(main())


