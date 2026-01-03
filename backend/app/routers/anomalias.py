from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import List, Optional
from pydantic import BaseModel
from decimal import Decimal
from datetime import date
from app.database import get_db
from app.models import Anomalias

router = APIRouter()


class AnomaliaResponse(BaseModel):
    transaction_id: str
    data_transacao: date
    descricao_original: str
    beneficiario: str | None
    categoria_nome: str
    fonte: str
    valor: Decimal
    media_categoria: Decimal | None
    z_score: Decimal | None
    anomaly_score: int
    is_anomaly: bool
    severidade: str
    ano_mes: str

    class Config:
        from_attributes = True


class AnomaliasResumoResponse(BaseModel):
    total_anomalias: int
    anomalias_alta: int
    anomalias_media: int
    anomalias_baixa: int
    valor_total_anomalias: Decimal


@router.get("", response_model=List[AnomaliaResponse])
def listar_anomalias(
    severidade: Optional[str] = Query(None, description="Filtrar por severidade (alta, media, baixa)"),
    apenas_anomalias: bool = Query(True, description="Apenas transações classificadas como anomalia"),
    limit: int = Query(50, description="Limite de registros"),
    db: Session = Depends(get_db)
):
    """Retorna transações anômalas"""
    query = db.query(Anomalias)
    
    if apenas_anomalias:
        query = query.filter(Anomalias.is_anomaly == True)
    
    if severidade:
        query = query.filter(Anomalias.severidade == severidade)
    
    return query.order_by(
        desc(Anomalias.anomaly_score),
        desc(Anomalias.data_transacao)
    ).limit(limit).all()


@router.get("/resumo", response_model=AnomaliasResumoResponse)
def resumo_anomalias(db: Session = Depends(get_db)):
    """Retorna resumo das anomalias"""
    total = db.query(func.count(Anomalias.transaction_id)).filter(
        Anomalias.is_anomaly == True
    ).scalar()
    
    alta = db.query(func.count(Anomalias.transaction_id)).filter(
        Anomalias.is_anomaly == True,
        Anomalias.severidade == "alta"
    ).scalar()
    
    media = db.query(func.count(Anomalias.transaction_id)).filter(
        Anomalias.is_anomaly == True,
        Anomalias.severidade == "media"
    ).scalar()
    
    baixa = db.query(func.count(Anomalias.transaction_id)).filter(
        Anomalias.is_anomaly == True,
        Anomalias.severidade == "baixa"
    ).scalar()
    
    valor_total = db.query(func.sum(Anomalias.valor)).filter(
        Anomalias.is_anomaly == True
    ).scalar()
    
    return AnomaliasResumoResponse(
        total_anomalias=total or 0,
        anomalias_alta=alta or 0,
        anomalias_media=media or 0,
        anomalias_baixa=baixa or 0,
        valor_total_anomalias=valor_total or 0
    )


@router.get("/alta-severidade", response_model=List[AnomaliaResponse])
def listar_alta_severidade(db: Session = Depends(get_db)):
    """Retorna apenas anomalias de alta severidade"""
    return db.query(Anomalias).filter(
        Anomalias.is_anomaly == True,
        Anomalias.severidade == "alta"
    ).order_by(
        desc(Anomalias.anomaly_score),
        desc(Anomalias.data_transacao)
    ).all()


