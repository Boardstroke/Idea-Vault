from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import List, Optional
from pydantic import BaseModel
from decimal import Decimal
from app.database import get_db
from app.models import GastosCategoria

router = APIRouter()


class CategoriaResponse(BaseModel):
    ano_mes: str
    categoria_id: str
    categoria_nome: str
    total_gasto: Decimal
    qtd_transacoes: int
    ticket_medio: Decimal
    percentual_do_total: Decimal
    tendencia: str
    ranking_mes: int

    class Config:
        from_attributes = True


class CategoriaResumoResponse(BaseModel):
    categoria_nome: str
    total_gasto: Decimal
    qtd_transacoes: int
    percentual_medio: Decimal


@router.get("", response_model=List[CategoriaResponse])
def listar_categorias(
    ano_mes: Optional[str] = Query(None, description="Filtrar por mês (YYYY-MM)"),
    limit: int = Query(100, description="Limite de registros"),
    db: Session = Depends(get_db)
):
    """Retorna gastos por categoria"""
    query = db.query(GastosCategoria)
    
    if ano_mes:
        query = query.filter(GastosCategoria.ano_mes == ano_mes)
    
    return query.order_by(
        desc(GastosCategoria.ano_mes),
        desc(GastosCategoria.total_gasto)
    ).limit(limit).all()


@router.get("/resumo", response_model=List[CategoriaResumoResponse])
def resumo_categorias(db: Session = Depends(get_db)):
    """Retorna resumo consolidado por categoria"""
    resultado = db.query(
        GastosCategoria.categoria_nome,
        func.sum(GastosCategoria.total_gasto).label("total_gasto"),
        func.sum(GastosCategoria.qtd_transacoes).label("qtd_transacoes"),
        func.avg(GastosCategoria.percentual_do_total).label("percentual_medio"),
    ).group_by(
        GastosCategoria.categoria_nome
    ).order_by(
        desc(func.sum(GastosCategoria.total_gasto))
    ).all()
    
    return [
        CategoriaResumoResponse(
            categoria_nome=r.categoria_nome,
            total_gasto=r.total_gasto,
            qtd_transacoes=r.qtd_transacoes,
            percentual_medio=round(r.percentual_medio, 1)
        )
        for r in resultado
    ]


@router.get("/{ano_mes}", response_model=List[CategoriaResponse])
def obter_categorias_mes(ano_mes: str, db: Session = Depends(get_db)):
    """Retorna gastos por categoria de um mês específico"""
    return db.query(GastosCategoria).filter(
        GastosCategoria.ano_mes == ano_mes
    ).order_by(
        desc(GastosCategoria.total_gasto)
    ).all()


