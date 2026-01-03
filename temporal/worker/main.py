"""
Temporal Worker for ML Pipeline

This worker handles both training and inference workflows.
Run this script to start processing workflows.
"""

import asyncio
import logging
import os
from concurrent.futures import ThreadPoolExecutor

from temporalio.client import Client
from temporalio.worker import Worker

# Import workflows
from temporal.workflows.train_workflow import TrainWorkflow
from temporal.workflows.inference_workflow import (
    InferenceWorkflow,
    ScheduledInferenceWorkflow,
)
from temporal.workflows.forecast_train_workflow import ForecastTrainWorkflow
from temporal.workflows.forecast_inference_workflow import ForecastInferenceWorkflow
from temporal.workflows.ingest_workflow import IngestWorkflow

# Import activities
from temporal.worker.activities import (
    # Anomaly detection activities
    extract_features,
    train_model,
    save_model_to_storage,
    deploy_to_kserve,
    fetch_new_transactions,
    call_kserve_inference,
    write_predictions,
    trigger_dbt_run,
    # Forecast activities
    extract_monthly_spending,
    prepare_sequences,
    train_transformer,
    save_forecast_model_to_storage,
    deploy_forecast_kserve,
    call_forecast_inference,
    write_forecast_results,
    # Ingest activities
    parse_csv_activity,
    insert_transactions_activity,
    run_dbt_activity,
    update_upload_status_activity,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


async def main():
    """Start the Temporal worker."""

    # Temporal server connection
    temporal_host = os.getenv("TEMPORAL_HOST", "localhost")
    temporal_port = os.getenv("TEMPORAL_PORT", "7233")
    temporal_address = f"{temporal_host}:{temporal_port}"

    task_queue = os.getenv("TASK_QUEUE", "ml-pipeline")

    logger.info(f"Connecting to Temporal at {temporal_address}")

    # Connect to Temporal
    client = await Client.connect(temporal_address)

    logger.info(f"Starting worker on task queue: {task_queue}")

    # Create worker with all workflows and activities
    worker = Worker(
        client,
        task_queue=task_queue,
        workflows=[
            # Anomaly detection workflows
            TrainWorkflow,
            InferenceWorkflow,
            ScheduledInferenceWorkflow,
            # Forecast workflows
            ForecastTrainWorkflow,
            ForecastInferenceWorkflow,
            # Ingest workflow
            IngestWorkflow,
        ],
        activities=[
            # Anomaly detection - Training
            extract_features,
            train_model,
            save_model_to_storage,
            deploy_to_kserve,
            # Anomaly detection - Inference
            fetch_new_transactions,
            call_kserve_inference,
            write_predictions,
            trigger_dbt_run,
            # Forecast - Training
            extract_monthly_spending,
            prepare_sequences,
            train_transformer,
            save_forecast_model_to_storage,
            deploy_forecast_kserve,
            # Forecast - Inference
            call_forecast_inference,
            write_forecast_results,
            # Ingest
            parse_csv_activity,
            insert_transactions_activity,
            run_dbt_activity,
            update_upload_status_activity,
        ],
        # Use thread pool for blocking activities
        activity_executor=ThreadPoolExecutor(max_workers=10),
    )

    logger.info("Worker started! Waiting for tasks...")

    # Run the worker
    await worker.run()


def run():
    """Entry point for the worker."""
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Worker stopped by user")
    except Exception as e:
        logger.error(f"Worker failed: {e}")
        raise


if __name__ == "__main__":
    run()
