"""
Training Workflow for Anomaly Detection Model

This workflow orchestrates the full training pipeline:
1. Extract features from PostgreSQL
2. Train Isolation Forest model
3. Save model to storage
4. Deploy to KServe
"""

from datetime import timedelta
from dataclasses import dataclass
from typing import Optional

from temporalio import workflow
from temporalio.common import RetryPolicy

# Import activities (will be defined in activities.py)
with workflow.unsafe.imports_passed_through():
    from temporal.worker.activities import (
        ExtractFeaturesInput,
        ExtractFeaturesOutput,
        TrainModelInput,
        TrainModelOutput,
        SaveModelInput,
        SaveModelOutput,
        DeployModelInput,
        DeployModelOutput,
        extract_features,
        train_model,
        save_model_to_storage,
        deploy_to_kserve,
    )


@dataclass
class TrainWorkflowInput:
    """Input parameters for training workflow."""
    contamination: float = 0.1
    n_estimators: int = 100
    min_samples: int = 50
    force_retrain: bool = False


@dataclass
class TrainWorkflowOutput:
    """Output of training workflow."""
    model_version: str
    model_path: str
    samples_used: int
    deployed: bool
    kserve_endpoint: Optional[str] = None


@workflow.defn
class TrainWorkflow:
    """
    Workflow for training and deploying anomaly detection model.
    
    Steps:
    1. Extract features from Silver layer
    2. Train Isolation Forest model
    3. Save model to MinIO/S3
    4. Deploy to KServe InferenceService
    """
    
    @workflow.run
    async def run(self, input: TrainWorkflowInput) -> TrainWorkflowOutput:
        workflow.logger.info("Starting TrainWorkflow")
        
        # Retry policy for activities
        retry_policy = RetryPolicy(
            initial_interval=timedelta(seconds=1),
            maximum_interval=timedelta(minutes=5),
            maximum_attempts=3,
        )
        
        # Step 1: Extract features
        workflow.logger.info("Step 1: Extracting features...")
        features_output = await workflow.execute_activity(
            extract_features,
            ExtractFeaturesInput(min_quality_score=50),
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=retry_policy,
        )
        
        if features_output.row_count < input.min_samples:
            raise ValueError(
                f"Not enough samples: {features_output.row_count} < {input.min_samples}"
            )
        
        workflow.logger.info(f"Extracted {features_output.row_count} samples")
        
        # Step 2: Train model
        workflow.logger.info("Step 2: Training model...")
        train_output = await workflow.execute_activity(
            train_model,
            TrainModelInput(
                features_path=features_output.features_path,
                contamination=input.contamination,
                n_estimators=input.n_estimators,
            ),
            start_to_close_timeout=timedelta(minutes=10),
            retry_policy=retry_policy,
        )
        
        workflow.logger.info(f"Model trained: {train_output.model_version}")
        
        # Step 3: Save model to storage
        workflow.logger.info("Step 3: Saving model to storage...")
        save_output = await workflow.execute_activity(
            save_model_to_storage,
            SaveModelInput(
                model_path=train_output.model_path,
                model_version=train_output.model_version,
            ),
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=retry_policy,
        )
        
        workflow.logger.info(f"Model saved to: {save_output.storage_uri}")
        
        # Step 4: Deploy to KServe
        workflow.logger.info("Step 4: Deploying to KServe...")
        try:
            deploy_output = await workflow.execute_activity(
                deploy_to_kserve,
                DeployModelInput(
                    model_name="anomaly-detector",
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
            deployed = False
            kserve_endpoint = None
        
        workflow.logger.info("TrainWorkflow completed!")
        
        return TrainWorkflowOutput(
            model_version=train_output.model_version,
            model_path=train_output.model_path,
            samples_used=features_output.row_count,
            deployed=deployed,
            kserve_endpoint=kserve_endpoint,
        )


