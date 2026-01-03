"""
Datasources Router - API endpoints for managing datasources and file uploads

Endpoints:
    GET  /api/datasources              - List available datasources
    GET  /api/datasources/{id}         - Get datasource details
    GET  /api/datasources/{id}/uploads - List upload history
    POST /api/datasources/{id}/upload  - Upload CSV file
    GET  /api/datasources/upload/{workflow_id}/status - Get upload status
"""

import os
import uuid
import tempfile
from datetime import datetime
from typing import List, Optional
from fastapi import (
    APIRouter,
    Depends,
    File,
    UploadFile,
    HTTPException,
    Query,
    BackgroundTasks,
)
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel
from decimal import Decimal

from app.database import get_db
from app.models import Datasource, Upload, RawTransaction
from app.parsers import get_parser, ParseResult


router = APIRouter()


# ============================================================
# Pydantic Models
# ============================================================


class DatasourceResponse(BaseModel):
    """Response model for datasource"""

    id: str
    nome: str
    tipo: str
    parser_id: str
    formato_esperado: Optional[dict] = None
    descricao: Optional[str] = None
    icone: Optional[str] = None
    cor: Optional[str] = None
    ativo: bool

    class Config:
        from_attributes = True


class UploadResponse(BaseModel):
    """Response model for upload"""

    id: int
    datasource_id: str
    nome_arquivo: str
    tamanho_bytes: Optional[int] = None
    periodo_inicio: Optional[str] = None
    periodo_fim: Optional[str] = None
    total_linhas: int
    linhas_inseridas: int
    linhas_duplicadas: int
    linhas_erro: int
    status: str
    workflow_id: Optional[str] = None
    erro: Optional[str] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class UploadStartResponse(BaseModel):
    """Response when starting an upload"""

    upload_id: int
    workflow_id: str
    status: str
    message: str


class UploadStatusResponse(BaseModel):
    """Response for upload status check"""

    upload_id: int
    status: str
    total_linhas: int
    linhas_inseridas: int
    linhas_duplicadas: int
    linhas_erro: int
    erro: Optional[str] = None
    periodo_inicio: Optional[str] = None
    periodo_fim: Optional[str] = None


class DatasourceStats(BaseModel):
    """Statistics for a datasource"""

    total_uploads: int
    uploads_sucesso: int
    uploads_falha: int
    total_transacoes: int
    ultimo_upload: Optional[datetime] = None


# ============================================================
# Endpoints
# ============================================================


@router.get("", response_model=List[DatasourceResponse])
def listar_datasources(
    ativo: Optional[bool] = Query(None, description="Filtrar por status ativo"),
    db: Session = Depends(get_db),
):
    """Lista todos os datasources disponíveis"""
    query = db.query(Datasource)

    if ativo is not None:
        query = query.filter(Datasource.ativo == ativo)

    return query.order_by(Datasource.nome).all()


@router.get("/{datasource_id}", response_model=DatasourceResponse)
def obter_datasource(
    datasource_id: str,
    db: Session = Depends(get_db),
):
    """Obtém detalhes de um datasource específico"""
    datasource = db.query(Datasource).filter(Datasource.id == datasource_id).first()

    if not datasource:
        raise HTTPException(status_code=404, detail="Datasource não encontrado")

    return datasource


@router.get("/{datasource_id}/stats", response_model=DatasourceStats)
def obter_datasource_stats(
    datasource_id: str,
    db: Session = Depends(get_db),
):
    """Obtém estatísticas de um datasource"""
    datasource = db.query(Datasource).filter(Datasource.id == datasource_id).first()

    if not datasource:
        raise HTTPException(status_code=404, detail="Datasource não encontrado")

    # Count uploads
    total_uploads = (
        db.query(Upload).filter(Upload.datasource_id == datasource_id).count()
    )
    uploads_sucesso = (
        db.query(Upload)
        .filter(Upload.datasource_id == datasource_id, Upload.status == "completed")
        .count()
    )
    uploads_falha = (
        db.query(Upload)
        .filter(Upload.datasource_id == datasource_id, Upload.status == "failed")
        .count()
    )

    # Count transactions from landing.raw_transactions (new system)
    raw_transacoes = (
        db.query(RawTransaction)
        .filter(RawTransaction.datasource_id == datasource_id)
        .count()
    )

    # Also count from silver.fct_transacoes (legacy data from dbt seeds)
    # Map datasource_id to fonte field in fct_transacoes
    fonte_map = {
        "nubank_extrato": "conta_corrente",
        "nubank_fatura": "cartao_credito",
    }
    fonte = fonte_map.get(datasource_id)

    fct_transacoes = 0
    if fonte:
        from app.models import Transacoes

        fct_transacoes = db.query(Transacoes).filter(Transacoes.fonte == fonte).count()

    # Use the higher count (fct_transacoes includes processed data)
    total_transacoes = max(raw_transacoes, fct_transacoes)

    # Last upload
    ultimo_upload = (
        db.query(Upload)
        .filter(Upload.datasource_id == datasource_id, Upload.status == "completed")
        .order_by(desc(Upload.completed_at))
        .first()
    )

    return DatasourceStats(
        total_uploads=total_uploads,
        uploads_sucesso=uploads_sucesso,
        uploads_falha=uploads_falha,
        total_transacoes=total_transacoes,
        ultimo_upload=ultimo_upload.completed_at if ultimo_upload else None,
    )


@router.get("/{datasource_id}/uploads", response_model=List[UploadResponse])
def listar_uploads(
    datasource_id: str,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    status: Optional[str] = Query(None, description="Filtrar por status"),
    db: Session = Depends(get_db),
):
    """Lista histórico de uploads de um datasource"""
    datasource = db.query(Datasource).filter(Datasource.id == datasource_id).first()

    if not datasource:
        raise HTTPException(status_code=404, detail="Datasource não encontrado")

    query = db.query(Upload).filter(Upload.datasource_id == datasource_id)

    if status:
        query = query.filter(Upload.status == status)

    uploads = query.order_by(desc(Upload.created_at)).offset(offset).limit(limit).all()

    return [
        UploadResponse(
            id=u.id,
            datasource_id=u.datasource_id,
            nome_arquivo=u.nome_arquivo,
            tamanho_bytes=u.tamanho_bytes,
            periodo_inicio=u.periodo_inicio.isoformat() if u.periodo_inicio else None,
            periodo_fim=u.periodo_fim.isoformat() if u.periodo_fim else None,
            total_linhas=u.total_linhas,
            linhas_inseridas=u.linhas_inseridas,
            linhas_duplicadas=u.linhas_duplicadas,
            linhas_erro=u.linhas_erro,
            status=u.status,
            workflow_id=u.workflow_id,
            erro=u.erro,
            created_at=u.created_at,
            started_at=u.started_at,
            completed_at=u.completed_at,
        )
        for u in uploads
    ]


@router.post("/{datasource_id}/upload", response_model=UploadStartResponse)
async def upload_arquivo(
    datasource_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="Arquivo CSV para upload"),
    db: Session = Depends(get_db),
):
    """
    Upload de arquivo CSV para processamento.

    O arquivo é validado, salvo temporariamente e processado em background.
    Para uso com Temporal, o workflow_id pode ser usado para acompanhar o progresso.
    """
    # Verify datasource exists
    datasource = db.query(Datasource).filter(Datasource.id == datasource_id).first()

    if not datasource:
        raise HTTPException(status_code=404, detail="Datasource não encontrado")

    if not datasource.ativo:
        raise HTTPException(status_code=400, detail="Datasource está desativado")

    # Validate file type
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Apenas arquivos CSV são aceitos")

    # Generate workflow ID
    workflow_id = f"ingest-{datasource_id}-{uuid.uuid4().hex[:8]}"

    # Create upload record
    upload = Upload(
        datasource_id=datasource_id,
        nome_arquivo=file.filename,
        tamanho_bytes=file.size,
        status="pending",
        workflow_id=workflow_id,
    )
    db.add(upload)
    db.commit()
    db.refresh(upload)

    # Save file temporarily
    temp_dir = tempfile.mkdtemp()
    temp_path = os.path.join(temp_dir, file.filename)

    try:
        contents = await file.read()
        with open(temp_path, "wb") as f:
            f.write(contents)

        # Process in background (for now, direct processing)
        # TODO: Replace with Temporal workflow call
        background_tasks.add_task(
            process_upload_sync,
            upload_id=upload.id,
            file_path=temp_path,
            datasource_id=datasource_id,
            parser_id=datasource.parser_id,
        )

    except Exception as e:
        # Update upload status on error
        upload.status = "failed"
        upload.erro = str(e)
        db.commit()
        raise HTTPException(status_code=500, detail=f"Erro ao salvar arquivo: {str(e)}")

    return UploadStartResponse(
        upload_id=upload.id,
        workflow_id=workflow_id,
        status="pending",
        message="Upload iniciado. Use o workflow_id para acompanhar o progresso.",
    )


@router.get("/upload/{workflow_id}/status", response_model=UploadStatusResponse)
def obter_status_upload(
    workflow_id: str,
    db: Session = Depends(get_db),
):
    """Obtém status de um upload pelo workflow_id"""
    upload = db.query(Upload).filter(Upload.workflow_id == workflow_id).first()

    if not upload:
        raise HTTPException(status_code=404, detail="Upload não encontrado")

    return UploadStatusResponse(
        upload_id=upload.id,
        status=upload.status,
        total_linhas=upload.total_linhas,
        linhas_inseridas=upload.linhas_inseridas,
        linhas_duplicadas=upload.linhas_duplicadas,
        linhas_erro=upload.linhas_erro,
        erro=upload.erro,
        periodo_inicio=upload.periodo_inicio.isoformat()
        if upload.periodo_inicio
        else None,
        periodo_fim=upload.periodo_fim.isoformat() if upload.periodo_fim else None,
    )


# ============================================================
# Background Processing (sync version for now)
# ============================================================


def process_upload_sync(
    upload_id: int,
    file_path: str,
    datasource_id: str,
    parser_id: str,
):
    """
    Process an upload synchronously.

    This function will be replaced by a Temporal workflow in production.
    For now, it processes the file directly in the background.
    """
    from app.database import SessionLocal
    import pandas as pd
    from sqlalchemy import text

    db = SessionLocal()

    try:
        # Update status to processing
        upload = db.query(Upload).filter(Upload.id == upload_id).first()
        upload.status = "processing"
        upload.started_at = datetime.utcnow()
        db.commit()

        # Get parser
        parser = get_parser(parser_id, datasource_id)
        if not parser:
            raise ValueError(f"Parser não encontrado: {parser_id}")

        # Read and parse CSV
        df = parser.read_csv(file_path)
        result = parser.parse(df)

        if not result.success:
            upload.status = "failed"
            upload.erro = "; ".join(result.errors[:5])
            upload.total_linhas = result.total_rows
            upload.linhas_erro = result.error_rows
            db.commit()
            return

        # Insert transactions with deduplication
        inserted = 0
        duplicated = 0

        for transaction in result.transactions:
            try:
                # Try to insert, ignore if duplicate
                stmt = text("""
                    INSERT INTO landing.raw_transactions 
                    (datasource_id, transaction_hash, data_transacao, valor, descricao, dados_raw, upload_id)
                    VALUES (:datasource_id, :transaction_hash, :data_transacao, :valor, :descricao, CAST(:dados_raw AS jsonb), :upload_id)
                    ON CONFLICT (transaction_hash) DO NOTHING
                    RETURNING id
                """)

                import json

                result_insert = db.execute(
                    stmt,
                    {
                        "datasource_id": transaction.datasource_id,
                        "transaction_hash": transaction.transaction_hash,
                        "data_transacao": transaction.data_transacao,
                        "valor": float(transaction.valor),
                        "descricao": transaction.descricao,
                        "dados_raw": json.dumps(transaction.dados_raw),
                        "upload_id": upload_id,
                    },
                )

                if result_insert.fetchone():
                    inserted += 1
                else:
                    duplicated += 1

            except Exception as e:
                # Log error but continue
                print(f"Error inserting transaction: {e}")
                duplicated += 1

        db.commit()

        # Update upload record
        upload.status = "completed"
        upload.completed_at = datetime.utcnow()
        upload.total_linhas = result.total_rows
        upload.linhas_inseridas = inserted
        upload.linhas_duplicadas = duplicated
        upload.linhas_erro = result.error_rows
        upload.periodo_inicio = result.periodo_inicio
        upload.periodo_fim = result.periodo_fim
        db.commit()

        # Run dbt to process the new data through bronze -> silver -> gold
        if inserted > 0:
            import subprocess
            from pathlib import Path

            dbt_dir = Path(__file__).parent.parent.parent.parent / "dbt"

            try:
                print(f"Running dbt to process {inserted} new transactions...")

                # Run dbt for bronze, silver, and gold models
                result_dbt = subprocess.run(
                    f"cd {dbt_dir} && dbt run --select +silver.fct_transacoes +gold",
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=300,  # 5 minute timeout
                )

                if result_dbt.returncode == 0:
                    print("dbt run completed successfully!")
                else:
                    print(f"dbt run failed: {result_dbt.stderr}")

            except subprocess.TimeoutExpired:
                print("dbt run timed out")
            except Exception as e:
                print(f"dbt run error: {e}")

        # Clean up temp file
        try:
            os.remove(file_path)
            os.rmdir(os.path.dirname(file_path))
        except:
            pass

    except Exception as e:
        # Update status on error
        upload = db.query(Upload).filter(Upload.id == upload_id).first()
        if upload:
            upload.status = "failed"
            upload.erro = str(e)
            db.commit()
        raise

    finally:
        db.close()
