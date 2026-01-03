"""
Forecast Inference Workflow

This workflow orchestrates inference for the Spending Transformer model:
1. Call KServe (or local model) for predictions
2. Write forecast results to PostgreSQL
"""

from datetime import timedelta
from dataclasses import dataclass
from typing import List, Optional, Dict, Any

from temporalio import workflow
from temporalio.common import RetryPolicy

# Import activities
with workflow.unsafe.imports_passed_through():
    from temporal.worker.activities import (
        CallForecastInferenceInput,
        CallForecastInferenceOutput,
        WriteForecastResultsInput,
        WriteForecastResultsOutput,
        call_forecast_inference,
        write_forecast_results,
    )


@dataclass
class ForecastInferenceWorkflowInput:
    """Input parameters for forecast inference workflow."""
    categories: Optional[List[str]] = None  # None = all categories
    history_months: int = 6                  # Months of history to use
    write_to_db: bool = True                 # Whether to persist results


@dataclass
class ForecastInferenceWorkflowOutput:
    """Output of forecast inference workflow."""
    predictions: List[Dict[str, Any]]
    model_version: str
    rows_written: int


@workflow.defn
class ForecastInferenceWorkflow:
    """
    Workflow for running spending forecast inference.
    
    Steps:
    1. Call forecast model (KServe or local)
    2. Write results to database (optional)
    """
    
    @workflow.run
    async def run(self, input: ForecastInferenceWorkflowInput) -> ForecastInferenceWorkflowOutput:
        workflow.logger.info("Starting ForecastInferenceWorkflow")
        
        # Retry policy
        retry_policy = RetryPolicy(
            initial_interval=timedelta(seconds=1),
            maximum_interval=timedelta(minutes=2),
            maximum_attempts=3,
        )
        
        # Get categories if not provided
        categories = input.categories
        if categories is None or len(categories) == 0:
            # Fetch all categories from database
            workflow.logger.info("Fetching all categories...")
            # For simplicity, use common categories
            categories = [
                "Alimentação",
                "Transporte",
                "Moradia",
                "Saúde",
                "Lazer",
                "Educação",
                "Compras",
                "Serviços",
                "Transferências",
                "Outros"
            ]
        
        workflow.logger.info(f"Running inference for {len(categories)} categories")
        
        # Step 1: Call inference
        workflow.logger.info("Step 1: Calling forecast model...")
        inference_output = await workflow.execute_activity(
            call_forecast_inference,
            CallForecastInferenceInput(
                model_name="spending-forecast",
                categories=categories,
                history_months=input.history_months,
            ),
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=retry_policy,
        )
        
        workflow.logger.info(
            f"Generated {len(inference_output.predictions)} predictions "
            f"(model: {inference_output.model_version})"
        )
        
        # Step 2: Write results (optional)
        rows_written = 0
        if input.write_to_db and len(inference_output.predictions) > 0:
            workflow.logger.info("Step 2: Writing results to database...")
            write_output = await workflow.execute_activity(
                write_forecast_results,
                WriteForecastResultsInput(
                    predictions=inference_output.predictions,
                    model_version=inference_output.model_version,
                ),
                start_to_close_timeout=timedelta(minutes=2),
                retry_policy=retry_policy,
            )
            rows_written = write_output.rows_written
            workflow.logger.info(f"Wrote {rows_written} predictions to database")
        
        workflow.logger.info("ForecastInferenceWorkflow completed!")
        
        return ForecastInferenceWorkflowOutput(
            predictions=inference_output.predictions,
            model_version=inference_output.model_version,
            rows_written=rows_written,
        )


