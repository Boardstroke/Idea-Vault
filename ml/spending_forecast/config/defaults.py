"""Default configuration values for spending forecast models."""

import os

# Database
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://dbt_user:dbt_password@localhost:5433/dbt_medallion",
)

# Sequence parameters
SEQ_LEN = 6  # months of history
PRED_LEN = 3  # months to predict

# Model architecture
D_MODEL = 64
NHEAD = 4
NUM_LAYERS = 2
DIM_FEEDFORWARD = 128
DROPOUT = 0.1

# Training
BATCH_SIZE = 32
LEARNING_RATE = 1e-3
EPOCHS = 100
PATIENCE = 10  # early stopping

# Loss types
LOSS_TYPE_GAUSSIAN_NLL = "gaussian_nll"
LOSS_TYPE_MSE = "mse"
DEFAULT_LOSS_TYPE = LOSS_TYPE_GAUSSIAN_NLL

# Pooling types (V1)
POOLING_ATTENTION = "attention"
POOLING_FLATTEN = "flatten"
POOLING_CLS = "cls"
DEFAULT_POOLING = POOLING_ATTENTION

# Model architectures
MODEL_ARCH_V1 = "v1"
MODEL_ARCH_V2 = "v2"
DEFAULT_MODEL_ARCH = MODEL_ARCH_V1

# MLflow
MLFLOW_TRACKING_URI = os.getenv("MLFLOW_TRACKING_URI", "http://localhost:5000")
MLFLOW_EXPERIMENT_NAME = "spending-forecast"

# Directories
MODEL_DIR = os.getenv("MODEL_DIR", "models")

# Primary metric for MLflow comparison (same for all models)
PRIMARY_METRIC = "mae_brl"
