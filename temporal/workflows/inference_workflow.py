"""
Inference Workflow for Anomaly Detection

This workflow orchestrates batch inference:
1. Fetch new transactions from PostgreSQL
2. Call KServe for predictions
3. Write predictions back to PostgreSQL
4. Optionally trigger dbt refresh
"""

from datetime import timedelta
from dataclasses import dataclass
from typing import Optional, List

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from temporal.worker.activities import (
        FetchTransactionsInput,
        FetchTransactionsOutput,
        CallKServeInput,
        CallKServeOutput,
        WritePredictionsInput,
        WritePredictionsOutput,
        TriggerDbtInput,
        TriggerDbtOutput,
        fetch_new_transactions,
        call_kserve_inference,
        write_predictions,
        trigger_dbt_run,
    )


@dataclass
class InferenceWorkflowInput:
    """Input parameters for inference workflow."""
    batch_size: int = 100
    model_name: str = "anomaly-detector"
    trigger_dbt: bool = True
    lookback_hours: int = 24


@dataclass 
class InferenceWorkflowOutput:
    """Output of inference workflow."""
    transactions_processed: int
    predictions_written: int
    anomalies_detected: int
    dbt_triggered: bool


@workflow.defn
class InferenceWorkflow:
    """
    Workflow for running batch inference on new transactions.
    
    Can be scheduled to run periodically or triggered manually.
    
    Steps:
    1. Fetch transactions without predictions
    2. Call KServe for batch predictions
    3. Write predictions to PostgreSQL
    4. Trigger dbt Gold layer refresh
    """
    
    @workflow.run
    async def run(self, input: InferenceWorkflowInput) -> InferenceWorkflowOutput:
        workflow.logger.info("Starting InferenceWorkflow")
        
        retry_policy = RetryPolicy(
            initial_interval=timedelta(seconds=1),
            maximum_interval=timedelta(minutes=2),
            maximum_attempts=3,
        )
        
        total_processed = 0
        total_predictions = 0
        total_anomalies = 0
        
        # Step 1: Fetch transactions in batches
        workflow.logger.info("Step 1: Fetching new transactions...")
        
        has_more = True
        offset = 0
        
        while has_more:
            fetch_output = await workflow.execute_activity(
                fetch_new_transactions,
                FetchTransactionsInput(
                    batch_size=input.batch_size,
                    offset=offset,
                    lookback_hours=input.lookback_hours,
                ),
                start_to_close_timeout=timedelta(minutes=5),
                retry_policy=retry_policy,
            )
            
            if not fetch_output.transaction_ids:
                workflow.logger.info("No more transactions to process")
                break
            
            workflow.logger.info(
                f"Processing batch of {len(fetch_output.transaction_ids)} transactions"
            )
            
            # Step 2: Call KServe for predictions
            workflow.logger.info("Step 2: Calling KServe for predictions...")
            kserve_output = await workflow.execute_activity(
                call_kserve_inference,
                CallKServeInput(
                    model_name=input.model_name,
                    features=fetch_output.features,
                    transaction_ids=fetch_output.transaction_ids,
                ),
                start_to_close_timeout=timedelta(minutes=5),
                retry_policy=retry_policy,
            )
            
            # Step 3: Write predictions to database
            workflow.logger.info("Step 3: Writing predictions to database...")
            write_output = await workflow.execute_activity(
                write_predictions,
                WritePredictionsInput(
                    transaction_ids=fetch_output.transaction_ids,
                    predictions=kserve_output.predictions,
                    model_version=kserve_output.model_version,
                ),
                start_to_close_timeout=timedelta(minutes=5),
                retry_policy=retry_policy,
            )
            
            total_processed += len(fetch_output.transaction_ids)
            total_predictions += write_output.rows_written
            total_anomalies += write_output.anomalies_count
            
            offset += input.batch_size
            has_more = fetch_output.has_more
        
        # Step 4: Trigger dbt refresh
        dbt_triggered = False
        if input.trigger_dbt and total_predictions > 0:
            workflow.logger.info("Step 4: Triggering dbt Gold refresh...")
            try:
                await workflow.execute_activity(
                    trigger_dbt_run,
                    TriggerDbtInput(select="gold"),
                    start_to_close_timeout=timedelta(minutes=15),
                    retry_policy=retry_policy,
                )
                dbt_triggered = True
                workflow.logger.info("dbt run completed")
            except Exception as e:
                workflow.logger.warning(f"dbt trigger failed: {e}")
        
        workflow.logger.info(
            f"InferenceWorkflow completed! "
            f"Processed: {total_processed}, Predictions: {total_predictions}, "
            f"Anomalies: {total_anomalies}"
        )
        
        return InferenceWorkflowOutput(
            transactions_processed=total_processed,
            predictions_written=total_predictions,
            anomalies_detected=total_anomalies,
            dbt_triggered=dbt_triggered,
        )


@workflow.defn
class ScheduledInferenceWorkflow:
    """
    Wrapper workflow that can be scheduled via Temporal.
    
    Usage:
        temporal schedule create \
            --schedule-id inference-schedule \
            --cron "0 * * * *" \
            --workflow-id scheduled-inference \
            --task-queue ml-pipeline \
            --workflow-type ScheduledInferenceWorkflow
    """
    
    @workflow.run
    async def run(self) -> InferenceWorkflowOutput:
        # Run with default parameters
        return await workflow.execute_child_workflow(
            InferenceWorkflow.run,
            InferenceWorkflowInput(),
            id=f"inference-{workflow.now().strftime('%Y%m%d-%H%M%S')}",
        )


