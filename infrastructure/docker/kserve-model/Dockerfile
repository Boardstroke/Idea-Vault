# KServe Custom Model Server
# For serving the anomaly detection model

FROM python:3.11-slim

LABEL maintainer="MLOps Team"
LABEL description="KServe Custom Model Server for Anomaly Detection"

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY ml/serving/requirements.txt /app/requirements.txt

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy serving code
COPY ml/serving/ /app/serving/

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV MODEL_NAME=anomaly-detector
ENV MODEL_DIR=/mnt/models

# Expose port
EXPOSE 8080

# Default command
CMD ["python", "serving/model.py"]


