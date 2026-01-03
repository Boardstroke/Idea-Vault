from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from pydantic import BaseModel
from decimal import Decimal
from datetime import date
from app.database import get_db
from app.models import ResumoAssinaturas

router = APIRouter()


class AssinaturaResponse(BaseModel):
    assinatura_id: str
    servico_nome: str
    status: str
    tipo_servico: str
    origem: str
    meses_cobranca: int
    valor_mensal: Decimal
    custo_anual_estimado: Decimal
    primeira_cobranca: date
    ultima_cobranca: date
    meses_sem_cobranca: int | None

    class Config:
        from_attributes = True


class AssinaturasResumoResponse(BaseModel):
    total_assinaturas: int
    assinaturas_ativas: int
    custo_mensal_total: Decimal
    custo_anual_total: Decimal
    por_tipo: dict


@router.get("", response_model=List[AssinaturaResponse])
def listar_assinaturas(
    status: Optional[str] = Query(None, description="Filtrar por status (ativa, inativa_recente, cancelada)"),
    db: Session = Depends(get_db)
):
    """Retorna lista de assinaturas"""
    query = db.query(ResumoAssinaturas)
    
    if status:
        query = query.filter(ResumoAssinaturas.status == status)
    
    return query.order_by(ResumoAssinaturas.custo_anual_estimado.desc()).all()


@router.get("/resumo", response_model=AssinaturasResumoResponse)
def resumo_assinaturas(db: Session = Depends(get_db)):
    """Retorna resumo das assinaturas"""
    # Total e ativas
    total = db.query(func.count(ResumoAssinaturas.assinatura_id)).scalar()
    ativas = db.query(func.count(ResumoAssinaturas.assinatura_id)).filter(
        ResumoAssinaturas.status == "ativa"
    ).scalar()
    
    # Custos das ativas
    custos = db.query(
        func.sum(ResumoAssinaturas.valor_mensal).label("mensal"),
        func.sum(ResumoAssinaturas.custo_anual_estimado).label("anual"),
    ).filter(ResumoAssinaturas.status == "ativa").first()
    
    # Por tipo de serviço
    por_tipo = db.query(
        ResumoAssinaturas.tipo_servico,
        func.sum(ResumoAssinaturas.valor_mensal).label("total"),
    ).filter(
        ResumoAssinaturas.status == "ativa"
    ).group_by(
        ResumoAssinaturas.tipo_servico
    ).all()
    
    return AssinaturasResumoResponse(
        total_assinaturas=total or 0,
        assinaturas_ativas=ativas or 0,
        custo_mensal_total=custos.mensal or 0,
        custo_anual_total=custos.anual or 0,
        por_tipo={r.tipo_servico: float(r.total) for r in por_tipo}
    )


@router.get("/ativas", response_model=List[AssinaturaResponse])
def listar_ativas(db: Session = Depends(get_db)):
    """Retorna apenas assinaturas ativas"""
    return db.query(ResumoAssinaturas).filter(
        ResumoAssinaturas.status == "ativa"
    ).order_by(
        ResumoAssinaturas.custo_anual_estimado.desc()
    ).all()


