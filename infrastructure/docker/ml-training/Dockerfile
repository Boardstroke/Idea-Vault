# ML Training Image
# Used for training the anomaly detection model

FROM python:3.11-slim

LABEL maintainer="MLOps Team"
LABEL description="Anomaly Detection Model Training"

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY ml/training/requirements.txt /app/requirements.txt

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy training code
COPY ml/training/ /app/training/
COPY ml/models/ /app/models/

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV MODEL_DIR=/app/models

# Create models directory
RUN mkdir -p /app/models

# Default command
CMD ["python", "training/train.py"]


