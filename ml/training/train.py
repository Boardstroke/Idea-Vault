"""
Anomaly Detection Model Training

Trains an Isolation Forest model on transaction features from the Silver layer.
The model is saved in sklearn format compatible with KServe.
"""

import os
import logging
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sqlalchemy import create_engine

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class AnomalyDetectorTrainer:
    """Trains and exports an Isolation Forest model for anomaly detection."""
    
    FEATURE_COLUMNS = [
        'absolute_amount',
        'day_of_week',
        'transaction_month',
        'is_weekend_int',
    ]
    
    def __init__(
        self,
        db_url: str,
        model_dir: str = "../models",
        contamination: float = 0.1,
        n_estimators: int = 100,
        random_state: int = 42
    ):
        self.db_url = db_url
        self.model_dir = Path(model_dir)
        self.model_dir.mkdir(parents=True, exist_ok=True)
        
        self.contamination = contamination
        self.n_estimators = n_estimators
        self.random_state = random_state
        
        self.engine = create_engine(db_url)
        self.model = None
        self.model_version = datetime.now().strftime("v%Y%m%d_%H%M%S")
    
    def fetch_features(self) -> pd.DataFrame:
        """Fetch transaction features from the Silver layer."""
        logger.info("Fetching features from database...")
        
        query = """
        SELECT
            transaction_id,
            absolute_amount,
            day_of_week::integer as day_of_week,
            transaction_month::integer as transaction_month,
            CASE WHEN is_weekend THEN 1 ELSE 0 END as is_weekend_int,
            is_amount_anomaly as label
        FROM silver.fct_transactions
        WHERE data_quality_score >= 50
        ORDER BY transaction_date DESC
        """
        
        df = pd.read_sql(query, self.engine)
        logger.info(f"Fetched {len(df)} records")
        return df
    
    def prepare_features(self, df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
        """Prepare features for training."""
        logger.info("Preparing features...")
        
        X = df[self.FEATURE_COLUMNS].values
        transaction_ids = df['transaction_id'].values
        
        # Log feature statistics
        logger.info(f"Feature shape: {X.shape}")
        logger.info(f"Feature columns: {self.FEATURE_COLUMNS}")
        
        return X, transaction_ids
    
    def train(self, X: np.ndarray) -> Pipeline:
        """Train the Isolation Forest model."""
        logger.info("Training Isolation Forest model...")
        
        # Create pipeline with scaler + model
        pipeline = Pipeline([
            ('scaler', StandardScaler()),
            ('isolation_forest', IsolationForest(
                n_estimators=self.n_estimators,
                contamination=self.contamination,
                random_state=self.random_state,
                n_jobs=-1
            ))
        ])
        
        pipeline.fit(X)
        
        # Get predictions for training data
        predictions = pipeline.predict(X)
        anomaly_count = np.sum(predictions == -1)
        
        logger.info(f"Training complete!")
        logger.info(f"Total samples: {len(X)}")
        logger.info(f"Detected anomalies: {anomaly_count} ({100*anomaly_count/len(X):.2f}%)")
        
        self.model = pipeline
        return pipeline
    
    def save_model(self) -> str:
        """Save model in sklearn format for KServe."""
        if self.model is None:
            raise ValueError("No model to save. Train first!")
        
        model_path = self.model_dir / f"anomaly_detector_{self.model_version}.joblib"
        
        logger.info(f"Saving model to {model_path}")
        joblib.dump(self.model, model_path)
        
        # Also save as latest
        latest_path = self.model_dir / "anomaly_detector_latest.joblib"
        joblib.dump(self.model, latest_path)
        
        # Save model metadata
        metadata = {
            'version': self.model_version,
            'feature_columns': self.FEATURE_COLUMNS,
            'contamination': self.contamination,
            'n_estimators': self.n_estimators,
            'created_at': datetime.now().isoformat()
        }
        
        metadata_path = self.model_dir / "model_metadata.json"
        import json
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        logger.info(f"Model saved successfully!")
        return str(model_path)
    
    def run(self) -> dict:
        """Execute the full training pipeline."""
        logger.info("=" * 50)
        logger.info("Starting Anomaly Detector Training Pipeline")
        logger.info("=" * 50)
        
        # Fetch data
        df = self.fetch_features()
        
        if len(df) < 10:
            raise ValueError(f"Not enough data to train: {len(df)} records")
        
        # Prepare features
        X, transaction_ids = self.prepare_features(df)
        
        # Train model
        self.train(X)
        
        # Save model
        model_path = self.save_model()
        
        logger.info("=" * 50)
        logger.info("Training Pipeline Complete!")
        logger.info("=" * 50)
        
        return {
            'model_version': self.model_version,
            'model_path': model_path,
            'samples_used': len(X),
            'feature_columns': self.FEATURE_COLUMNS
        }


def main():
    """Main entry point for training."""
    # Database connection
    db_url = os.getenv(
        'DATABASE_URL',
        'postgresql://dbt_user:dbt_password@localhost:5433/dbt_medallion'
    )
    
    # Model directory
    model_dir = os.getenv('MODEL_DIR', '../models')
    
    # Training parameters
    contamination = float(os.getenv('CONTAMINATION', '0.1'))
    n_estimators = int(os.getenv('N_ESTIMATORS', '100'))
    
    trainer = AnomalyDetectorTrainer(
        db_url=db_url,
        model_dir=model_dir,
        contamination=contamination,
        n_estimators=n_estimators
    )
    
    result = trainer.run()
    print(f"\n✅ Model trained: {result['model_version']}")
    print(f"   Samples: {result['samples_used']}")
    print(f"   Path: {result['model_path']}")


if __name__ == "__main__":
    main()


