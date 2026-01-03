# MLflow Server with PostgreSQL support
FROM ghcr.io/mlflow/mlflow:v3.8.0

# Install PostgreSQL driver and boto3 for S3
RUN pip install --no-cache-dir \
    psycopg2-binary \
    boto3

# Expose port
EXPOSE 5000

