from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from pydantic import BaseModel
from decimal import Decimal
from app.database import get_db
from app.models import BalancoMensal

router = APIRouter()


class BalancoResponse(BaseModel):
    ano_mes: str
    ano: int
    mes: int
    total_entradas: Decimal
    total_saidas: Decimal
    saldo_mensal: Decimal
    saldo_acumulado: Decimal
    saidas_conta_corrente: Decimal
    saidas_cartao_credito: Decimal
    total_transacoes: int
    taxa_poupanca_pct: Decimal | None
    variacao_saidas_pct: Decimal | None
    status_mes: str

    class Config:
        from_attributes = True


class ResumoAnualResponse(BaseModel):
    total_entradas: Decimal
    total_saidas: Decimal
    saldo_total: Decimal
    media_mensal_entradas: Decimal
    media_mensal_saidas: Decimal
    meses_superavit: int
    meses_deficit: int


@router.get("", response_model=List[BalancoResponse])
def listar_balanco(db: Session = Depends(get_db)):
    """Retorna o balanço de todos os meses"""
    return db.query(BalancoMensal).order_by(BalancoMensal.ano_mes).all()


@router.get("/resumo", response_model=ResumoAnualResponse)
def resumo_anual(db: Session = Depends(get_db)):
    """Retorna o resumo anual consolidado"""
    resultado = db.query(
        func.sum(BalancoMensal.total_entradas).label("total_entradas"),
        func.sum(BalancoMensal.total_saidas).label("total_saidas"),
        func.sum(BalancoMensal.saldo_mensal).label("saldo_total"),
        func.avg(BalancoMensal.total_entradas).label("media_mensal_entradas"),
        func.avg(BalancoMensal.total_saidas).label("media_mensal_saidas"),
        func.count().filter(BalancoMensal.status_mes == "superavit").label("meses_superavit"),
        func.count().filter(BalancoMensal.status_mes == "deficit").label("meses_deficit"),
    ).first()
    
    return ResumoAnualResponse(
        total_entradas=resultado.total_entradas or 0,
        total_saidas=resultado.total_saidas or 0,
        saldo_total=resultado.saldo_total or 0,
        media_mensal_entradas=resultado.media_mensal_entradas or 0,
        media_mensal_saidas=resultado.media_mensal_saidas or 0,
        meses_superavit=resultado.meses_superavit or 0,
        meses_deficit=resultado.meses_deficit or 0,
    )


@router.get("/{ano_mes}", response_model=BalancoResponse)
def obter_balanco_mes(ano_mes: str, db: Session = Depends(get_db)):
    """Retorna o balanço de um mês específico"""
    return db.query(BalancoMensal).filter(BalancoMensal.ano_mes == ano_mes).first()


