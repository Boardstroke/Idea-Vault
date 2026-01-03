FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install PyTorch (CPU only)
RUN pip install --no-cache-dir \
    torch --index-url https://download.pytorch.org/whl/cpu

# Install other Python dependencies
RUN pip install --no-cache-dir \
    kserve \
    numpy \
    pandas \
    sqlalchemy \
    psycopg2-binary

# Copy model code
COPY ml/models/ ./models/
COPY ml/serving/forecast_model.py .

# Create model directory
RUN mkdir -p /mnt/models

# Expose port
EXPOSE 8080

# Set environment variables
ENV MODEL_NAME=spending-forecast
ENV MODEL_DIR=/mnt/models

# Run model server
CMD ["python", "forecast_model.py"]

