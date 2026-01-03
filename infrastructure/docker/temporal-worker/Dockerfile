# Temporal Worker Image
# Runs the ML pipeline workflows and activities

FROM python:3.11-slim

LABEL maintainer="MLOps Team"
LABEL description="Temporal Worker for ML Pipeline"

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install dbt for the trigger_dbt_run activity
RUN pip install --no-cache-dir dbt-core dbt-postgres

# Copy temporal requirements
COPY temporal/requirements.txt /app/requirements.txt

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy temporal code
COPY temporal/ /app/temporal/

# Copy dbt project for dbt run activity
COPY dbt/ /app/dbt/

# Copy ML training code (for local model loading)
COPY ml/training/ /app/ml/training/
COPY ml/models/ /app/ml/models/

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
ENV MODEL_DIR=/app/ml/models
ENV DBT_DIR=/app/dbt
ENV TEMPORAL_HOST=temporal
ENV TEMPORAL_PORT=7233
ENV DATABASE_URL=postgresql://dbt_user:dbt_password@postgres:5432/dbt_medallion

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD python -c "import temporalio; print('OK')" || exit 1

# Default command - start the worker
CMD ["python", "-m", "temporal.worker.main"]


