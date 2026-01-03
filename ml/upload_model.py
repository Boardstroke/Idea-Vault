#!/usr/bin/env python
"""
Upload modelo treinado para o MinIO.
"""

import os
import sys
from pathlib import Path

import boto3
from botocore.client import Config


def upload_model_to_minio(
    model_path: str,
    bucket: str = "ml-models",
    model_name: str = "anomaly-detector",
    endpoint: str = None,
    access_key: str = None,
    secret_key: str = None,
):
    """Upload modelo para MinIO/S3."""
    
    # Configurações padrão
    endpoint = endpoint or os.getenv("MINIO_ENDPOINT", "http://localhost:9000")
    access_key = access_key or os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    secret_key = secret_key or os.getenv("MINIO_SECRET_KEY", "minioadmin")
    
    print(f"📦 Conectando ao MinIO em {endpoint}")
    
    # Cliente S3 compatível com MinIO
    s3 = boto3.client(
        's3',
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=Config(signature_version='s3v4'),
        region_name='us-east-1'
    )
    
    # Criar bucket se não existir
    try:
        s3.head_bucket(Bucket=bucket)
        print(f"✅ Bucket '{bucket}' existe")
    except:
        print(f"📁 Criando bucket '{bucket}'...")
        s3.create_bucket(Bucket=bucket)
    
    # Upload do modelo
    model_file = Path(model_path)
    if not model_file.exists():
        raise FileNotFoundError(f"Modelo não encontrado: {model_path}")
    
    # KServe espera o modelo em: s3://bucket/model-name/model.joblib
    s3_key = f"{model_name}/model.joblib"
    
    print(f"📤 Uploading {model_file} -> s3://{bucket}/{s3_key}")
    s3.upload_file(str(model_file), bucket, s3_key)
    
    # Upload metadata se existir
    metadata_path = model_file.parent / "model_metadata.json"
    if metadata_path.exists():
        metadata_key = f"{model_name}/model_metadata.json"
        print(f"📤 Uploading metadata -> s3://{bucket}/{metadata_key}")
        s3.upload_file(str(metadata_path), bucket, metadata_key)
    
    storage_uri = f"s3://{bucket}/{model_name}"
    print(f"✅ Upload completo!")
    print(f"   Storage URI: {storage_uri}")
    
    return storage_uri


def main():
    # Caminho padrão do modelo
    model_path = os.getenv("MODEL_PATH", "/tmp/models/model.joblib")
    
    # Verificar se existe o latest
    if not Path(model_path).exists():
        latest_path = Path("/tmp/models")
        joblib_files = list(latest_path.glob("model_*.joblib"))
        if joblib_files:
            model_path = str(sorted(joblib_files)[-1])
        else:
            print("❌ Nenhum modelo encontrado!")
            sys.exit(1)
    
    print(f"🔍 Usando modelo: {model_path}")
    
    uri = upload_model_to_minio(model_path)
    print(f"\n🎉 Modelo disponível em: {uri}")


if __name__ == "__main__":
    main()


