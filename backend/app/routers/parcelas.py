from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from pydantic import BaseModel
from decimal import Decimal
from datetime import date
from app.database import get_db
from app.models import Parcelas

router = APIRouter()


class ParcelaResponse(BaseModel):
    compra_id: str
    estabelecimento: str
    categoria_nome: str
    total_parcelas: int
    parcelas_pagas: int
    parcelas_restantes: int
    valor_parcela: Decimal
    valor_total_compra: Decimal
    total_pago: Decimal
    valor_restante: Decimal
    status_compra: str
    data_primeira_parcela: date
    data_ultima_parcela: date
    data_proxima_parcela: date | None
    mes_fim_previsto: str

    class Config:
        from_attributes = True


class ParcelasResumoResponse(BaseModel):
    total_compras_parceladas: int
    compras_em_andamento: int
    compras_quitadas: int
    total_valor_restante: Decimal
    proximas_parcelas_valor: Decimal


@router.get("", response_model=List[ParcelaResponse])
def listar_parcelas(
    status: Optional[str] = Query(None, description="Filtrar por status (em_andamento, quitada)"),
    db: Session = Depends(get_db)
):
    """Retorna lista de compras parceladas"""
    query = db.query(Parcelas)
    
    if status:
        query = query.filter(Parcelas.status_compra == status)
    
    return query.order_by(Parcelas.valor_restante.desc()).all()


@router.get("/resumo", response_model=ParcelasResumoResponse)
def resumo_parcelas(db: Session = Depends(get_db)):
    """Retorna resumo das parcelas"""
    total = db.query(func.count(Parcelas.compra_id)).scalar()
    
    em_andamento = db.query(func.count(Parcelas.compra_id)).filter(
        Parcelas.status_compra == "em_andamento"
    ).scalar()
    
    quitadas = db.query(func.count(Parcelas.compra_id)).filter(
        Parcelas.status_compra == "quitada"
    ).scalar()
    
    valor_restante = db.query(func.sum(Parcelas.valor_restante)).filter(
        Parcelas.status_compra == "em_andamento"
    ).scalar()
    
    # Próximas parcelas (mês que vem)
    proximas = db.query(func.sum(Parcelas.valor_parcela)).filter(
        Parcelas.status_compra == "em_andamento",
        Parcelas.parcelas_restantes > 0
    ).scalar()
    
    return ParcelasResumoResponse(
        total_compras_parceladas=total or 0,
        compras_em_andamento=em_andamento or 0,
        compras_quitadas=quitadas or 0,
        total_valor_restante=valor_restante or 0,
        proximas_parcelas_valor=proximas or 0
    )


@router.get("/em-andamento", response_model=List[ParcelaResponse])
def listar_em_andamento(db: Session = Depends(get_db)):
    """Retorna apenas parcelas em andamento"""
    return db.query(Parcelas).filter(
        Parcelas.status_compra == "em_andamento"
    ).order_by(
        Parcelas.valor_restante.desc()
    ).all()


