"""
Forecast Training Workflow

This workflow orchestrates the full training pipeline for the
Spending Transformer model:
1. Extract monthly spending data from Gold layer
2. Prepare training sequences
3. Train Transformer model
4. Save model to storage
5. Deploy to KServe
"""

from datetime import timedelta
from dataclasses import dataclass
from typing import Optional, Dict, Any

from temporalio import workflow
from temporalio.common import RetryPolicy

# Import activities
with workflow.unsafe.imports_passed_through():
    from temporal.worker.activities import (
        ExtractMonthlySpendingInput,
        ExtractMonthlySpendingOutput,
        PrepareSequencesInput,
        PrepareSequencesOutput,
        TrainTransformerInput,
        TrainTransformerOutput,
        SaveForecastModelInput,
        SaveForecastModelOutput,
        DeployForecastKServeInput,
        DeployForecastKServeOutput,
        extract_monthly_spending,
        prepare_sequences,
        train_transformer,
        save_forecast_model_to_storage,
        deploy_forecast_kserve,
    )


@dataclass
class ForecastTrainWorkflowInput:
    """Input parameters for forecast training workflow."""
    min_months: int = 9           # Minimum months of data required
    seq_len: int = 6              # Input sequence length
    pred_len: int = 3             # Prediction length
    d_model: int = 64             # Model dimension
    num_layers: int = 2           # Number of transformer layers
    epochs: int = 100             # Max training epochs
    batch_size: int = 32          # Training batch size
    learning_rate: float = 0.001  # Learning rate
    deploy_to_kserve: bool = True # Whether to deploy after training


@dataclass
class ForecastTrainWorkflowOutput:
    """Output of forecast training workflow."""
    model_version: str
    model_path: str
    metrics: Dict[str, Any]
    deployed: bool
    kserve_endpoint: Optional[str] = None


@workflow.defn
class ForecastTrainWorkflow:
    """
    Workflow for training and deploying spending forecast model.
    
    Steps:
    1. Extract monthly spending data from Gold layer
    2. Prepare training sequences (sliding windows)
    3. Train Transformer model with early stopping
    4. Save model to MinIO/S3
    5. Deploy to KServe InferenceService (optional)
    """
    
    @workflow.run
    async def run(self, input: ForecastTrainWorkflowInput) -> ForecastTrainWorkflowOutput:
        workflow.logger.info("Starting ForecastTrainWorkflow")
        
        # Retry policy for activities
        retry_policy = RetryPolicy(
            initial_interval=timedelta(seconds=1),
            maximum_interval=timedelta(minutes=5),
            maximum_attempts=3,
        )
        
        # Step 1: Extract monthly spending data
        workflow.logger.info("Step 1: Extracting monthly spending data...")
        extract_output = await workflow.execute_activity(
            extract_monthly_spending,
            ExtractMonthlySpendingInput(min_months=input.min_months),
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=retry_policy,
        )
        
        workflow.logger.info(
            f"Extracted data for {extract_output.n_categories} categories "
            f"over {extract_output.n_months} months"
        )
        
        # Step 2: Prepare training sequences
        workflow.logger.info("Step 2: Preparing training sequences...")
        sequences_output = await workflow.execute_activity(
            prepare_sequences,
            PrepareSequencesInput(
                data_path=extract_output.data_path,
                seq_len=input.seq_len,
                pred_len=input.pred_len,
            ),
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=retry_policy,
        )
        
        workflow.logger.info(f"Created {sequences_output.n_sequences} training sequences")
        
        if sequences_output.n_sequences < 10:
            raise ValueError(
                f"Not enough training sequences: {sequences_output.n_sequences} < 10"
            )
        
        # Step 3: Train Transformer model
        workflow.logger.info("Step 3: Training Transformer model...")
        train_output = await workflow.execute_activity(
            train_transformer,
            TrainTransformerInput(
                sequences_path=sequences_output.sequences_path,
                category_mapping=extract_output.category_mapping,
                scaler_params=sequences_output.scaler_params,
                d_model=input.d_model,
                num_layers=input.num_layers,
                epochs=input.epochs,
                batch_size=input.batch_size,
                learning_rate=input.learning_rate,
            ),
            start_to_close_timeout=timedelta(minutes=30),
            retry_policy=retry_policy,
        )
        
        workflow.logger.info(
            f"Model trained: {train_output.model_version}, "
            f"val_loss={train_output.metrics['val_loss']:.4f}"
        )
        
        # Step 4: Save model to storage
        workflow.logger.info("Step 4: Saving model to storage...")
        save_output = await workflow.execute_activity(
            save_forecast_model_to_storage,
            SaveForecastModelInput(
                model_path=train_output.model_path,
                model_version=train_output.model_version,
            ),
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=retry_policy,
        )
        
        workflow.logger.info(f"Model saved to: {save_output.storage_uri}")
        
        # Step 5: Deploy to KServe (optional)
        deployed = False
        kserve_endpoint = None
        
        if input.deploy_to_kserve:
            workflow.logger.info("Step 5: Deploying to KServe...")
            try:
                deploy_output = await workflow.execute_activity(
                    deploy_forecast_kserve,
                    DeployForecastKServeInput(
                        model_name="spending-forecast",
                        model_version=train_output.model_version,
                        storage_uri=save_output.storage_uri,
                    ),
                    start_to_close_timeout=timedelta(minutes=10),
                    retry_policy=retry_policy,
                )
                deployed = True
                kserve_endpoint = deploy_output.endpoint
                workflow.logger.info(f"Deployed to: {kserve_endpoint}")
            except Exception as e:
                workflow.logger.warning(f"KServe deployment failed: {e}")
        
        workflow.logger.info("ForecastTrainWorkflow completed!")
        
        return ForecastTrainWorkflowOutput(
            model_version=train_output.model_version,
            model_path=train_output.model_path,
            metrics=train_output.metrics,
            deployed=deployed,
            kserve_endpoint=kserve_endpoint,
        )


