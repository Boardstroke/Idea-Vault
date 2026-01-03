"""
Custom model wrapper for KServe inference.

This module provides a custom predictor that wraps the Isolation Forest model
and returns anomaly scores and predictions.
"""

import os
import logging
from typing import Dict, Any

import joblib
import numpy as np
from kserve import Model, ModelServer
from kserve.errors import ModelMissingError

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class AnomalyDetectorModel(Model):
    """
    Custom KServe model for anomaly detection.
    
    Expects input in the format:
    {
        "instances": [
            [amount, day_of_week, month, is_weekend],
            ...
        ]
    }
    
    Returns:
    {
        "predictions": [
            {"is_anomaly": true/false, "anomaly_score": 0.0-1.0},
            ...
        ]
    }
    """
    
    def __init__(self, name: str, model_dir: str = "/mnt/models"):
        super().__init__(name)
        self.name = name
        self.model_dir = model_dir
        self.model = None
        self.ready = False
    
    def load(self) -> bool:
        """Load the trained model."""
        model_path = os.path.join(self.model_dir, "anomaly_detector_latest.joblib")
        
        if not os.path.exists(model_path):
            raise ModelMissingError(model_path)
        
        logger.info(f"Loading model from {model_path}")
        self.model = joblib.load(model_path)
        self.ready = True
        logger.info("Model loaded successfully!")
        
        return self.ready
    
    def predict(self, payload: Dict[str, Any], headers: Dict[str, str] = None) -> Dict[str, Any]:
        """
        Make predictions on input data.
        
        Args:
            payload: Dict with 'instances' key containing feature arrays
            headers: Optional request headers
            
        Returns:
            Dict with predictions including anomaly flag and score
        """
        instances = payload.get("instances", [])
        
        if not instances:
            return {"predictions": []}
        
        # Convert to numpy array
        X = np.array(instances)
        
        # Get predictions (-1 = anomaly, 1 = normal)
        predictions = self.model.predict(X)
        
        # Get anomaly scores (negative = more anomalous)
        # decision_function returns negative values for anomalies
        scores = self.model.decision_function(X)
        
        # Normalize scores to 0-1 range (higher = more anomalous)
        # Original: negative = anomaly, positive = normal
        # Normalized: 0 = normal, 1 = anomaly
        min_score = scores.min()
        max_score = scores.max()
        if max_score - min_score > 0:
            normalized_scores = 1 - (scores - min_score) / (max_score - min_score)
        else:
            normalized_scores = np.zeros_like(scores)
        
        # Build response
        results = []
        for i in range(len(X)):
            results.append({
                "is_anomaly": bool(predictions[i] == -1),
                "anomaly_score": float(normalized_scores[i]),
                "raw_score": float(scores[i])
            })
        
        return {"predictions": results}


if __name__ == "__main__":
    # For local testing / development
    model = AnomalyDetectorModel("anomaly-detector", model_dir="../models")
    ModelServer().start([model])


