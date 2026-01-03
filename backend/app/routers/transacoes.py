from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import List, Optional
from pydantic import BaseModel
from decimal import Decimal
from datetime import date
from app.database import get_db
from app.models import Transacoes

router = APIRouter()


class TransacaoResponse(BaseModel):
    transaction_id: str
    data_transacao: date
    valor: Decimal
    valor_absoluto: Decimal
    descricao_original: str
    tipo_transacao: str
    beneficiario: str | None
    is_entrada: bool
    is_saida: bool
    fonte: str
    is_parcelado: bool
    categoria_id: str
    categoria_nome: str
    ano_mes: str

    # Campos de vendor (enriquecimento)
    vendor_id: str | None = None
    vendor_nome: str | None = None
    vendor_logo_url: str | None = None
    vendor_icone: str | None = None
    vendor_cor: str | None = None

    class Config:
        from_attributes = True


class TransacoesPaginatedResponse(BaseModel):
    items: List[TransacaoResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


@router.get("", response_model=TransacoesPaginatedResponse)
def listar_transacoes(
    page: int = Query(1, ge=1, description="Página"),
    page_size: int = Query(20, ge=1, le=100, description="Itens por página"),
    categoria: Optional[str] = Query(None, description="Filtrar por categoria"),
    fonte: Optional[str] = Query(
        None, description="Filtrar por fonte (conta_corrente, cartao_credito)"
    ),
    ano_mes: Optional[str] = Query(None, description="Filtrar por mês (YYYY-MM)"),
    data_inicio: Optional[date] = Query(None, description="Data inicial (YYYY-MM-DD)"),
    data_fim: Optional[date] = Query(None, description="Data final (YYYY-MM-DD)"),
    tipo: Optional[str] = Query(None, description="Filtrar por tipo (entrada, saida)"),
    busca: Optional[str] = Query(None, description="Buscar por descrição"),
    valor_min: Optional[float] = Query(None, description="Valor mínimo"),
    valor_max: Optional[float] = Query(None, description="Valor máximo"),
    db: Session = Depends(get_db),
):
    """Retorna transações paginadas"""
    query = db.query(Transacoes)

    # Aplicar filtros
    if categoria:
        query = query.filter(Transacoes.categoria_id == categoria)
    if fonte:
        query = query.filter(Transacoes.fonte == fonte)
    # Filtro por intervalo de datas tem prioridade sobre ano_mes
    if data_inicio:
        query = query.filter(Transacoes.data_transacao >= data_inicio)
    if data_fim:
        query = query.filter(Transacoes.data_transacao <= data_fim)
    if ano_mes and not data_inicio and not data_fim:
        query = query.filter(Transacoes.ano_mes == ano_mes)
    if tipo == "entrada":
        query = query.filter(Transacoes.is_entrada == True)
    elif tipo == "saida":
        query = query.filter(Transacoes.is_saida == True)
    if busca:
        query = query.filter(Transacoes.descricao_original.ilike(f"%{busca}%"))
    if valor_min is not None:
        query = query.filter(Transacoes.valor_absoluto >= valor_min)
    if valor_max is not None:
        query = query.filter(Transacoes.valor_absoluto <= valor_max)

    # Contar total
    total = query.count()
    total_pages = (total + page_size - 1) // page_size

    # Paginar
    items = (
        query.order_by(desc(Transacoes.data_transacao))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return TransacoesPaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/recentes", response_model=List[TransacaoResponse])
def transacoes_recentes(
    limit: int = Query(10, description="Limite de registros"),
    db: Session = Depends(get_db),
):
    """Retorna as transações mais recentes"""
    return (
        db.query(Transacoes)
        .order_by(desc(Transacoes.data_transacao))
        .limit(limit)
        .all()
    )


@router.get("/categorias")
def listar_categorias_disponiveis(db: Session = Depends(get_db)):
    """Retorna lista de categorias disponíveis"""
    categorias = (
        db.query(Transacoes.categoria_id, Transacoes.categoria_nome).distinct().all()
    )

    return [{"id": c.categoria_id, "nome": c.categoria_nome} for c in categorias]


class CategoriaStats(BaseModel):
    categoria_id: str
    categoria_nome: str
    total_entradas: Decimal
    total_saidas: Decimal
    saldo: Decimal
    qtd_transacoes: int
    qtd_entradas: int
    qtd_saidas: int


@router.get("/categorias/stats", response_model=List[CategoriaStats])
def estatisticas_por_categoria(
    ano_mes: Optional[str] = Query(None, description="Filtrar por mês (YYYY-MM)"),
    fonte: Optional[str] = Query(
        None, description="Filtrar por fonte (conta_corrente, cartao_credito)"
    ),
    db: Session = Depends(get_db),
):
    """Retorna estatísticas de entradas e saídas por categoria"""
    from sqlalchemy import case

    query = db.query(
        Transacoes.categoria_id,
        Transacoes.categoria_nome,
        func.sum(
            case((Transacoes.is_entrada == True, Transacoes.valor_absoluto), else_=0)
        ).label("total_entradas"),
        func.sum(
            case((Transacoes.is_saida == True, Transacoes.valor_absoluto), else_=0)
        ).label("total_saidas"),
        func.sum(
            case(
                (Transacoes.is_entrada == True, Transacoes.valor_absoluto),
                (Transacoes.is_saida == True, -Transacoes.valor_absoluto),
                else_=0,
            )
        ).label("saldo"),
        func.count(Transacoes.transaction_id).label("qtd_transacoes"),
        func.sum(case((Transacoes.is_entrada == True, 1), else_=0)).label(
            "qtd_entradas"
        ),
        func.sum(case((Transacoes.is_saida == True, 1), else_=0)).label("qtd_saidas"),
    ).group_by(Transacoes.categoria_id, Transacoes.categoria_nome)

    if ano_mes:
        query = query.filter(Transacoes.ano_mes == ano_mes)
    if fonte:
        query = query.filter(Transacoes.fonte == fonte)

    results = query.order_by(desc("total_saidas")).all()

    return [
        CategoriaStats(
            categoria_id=r.categoria_id,
            categoria_nome=r.categoria_nome,
            total_entradas=r.total_entradas or 0,
            total_saidas=r.total_saidas or 0,
            saldo=r.saldo or 0,
            qtd_transacoes=r.qtd_transacoes or 0,
            qtd_entradas=r.qtd_entradas or 0,
            qtd_saidas=r.qtd_saidas or 0,
        )
        for r in results
    ]


class FonteStats(BaseModel):
    fonte: str
    fonte_label: str
    total_entradas: Decimal
    total_saidas: Decimal
    saldo: Decimal
    qtd_transacoes: int
    qtd_entradas: int
    qtd_saidas: int


# Mapeamento de fonte para label amigável
FONTE_LABELS = {
    "conta_corrente": "Nubank - Conta Corrente",
    "cartao_credito": "Nubank - Cartão de Crédito",
}


@router.get("/fontes/stats", response_model=List[FonteStats])
def estatisticas_por_fonte(
    ano_mes: Optional[str] = Query(None, description="Filtrar por mês (YYYY-MM)"),
    categoria: Optional[str] = Query(None, description="Filtrar por categoria"),
    db: Session = Depends(get_db),
):
    """Retorna estatísticas de entradas e saídas por fonte (datasource)"""
    from sqlalchemy import case

    query = db.query(
        Transacoes.fonte,
        func.sum(
            case((Transacoes.is_entrada == True, Transacoes.valor_absoluto), else_=0)
        ).label("total_entradas"),
        func.sum(
            case((Transacoes.is_saida == True, Transacoes.valor_absoluto), else_=0)
        ).label("total_saidas"),
        func.sum(
            case(
                (Transacoes.is_entrada == True, Transacoes.valor_absoluto),
                (Transacoes.is_saida == True, -Transacoes.valor_absoluto),
                else_=0,
            )
        ).label("saldo"),
        func.count(Transacoes.transaction_id).label("qtd_transacoes"),
        func.sum(case((Transacoes.is_entrada == True, 1), else_=0)).label(
            "qtd_entradas"
        ),
        func.sum(case((Transacoes.is_saida == True, 1), else_=0)).label("qtd_saidas"),
    ).group_by(Transacoes.fonte)

    if ano_mes:
        query = query.filter(Transacoes.ano_mes == ano_mes)
    if categoria:
        query = query.filter(Transacoes.categoria_id == categoria)

    results = query.order_by(desc("qtd_transacoes")).all()

    return [
        FonteStats(
            fonte=r.fonte,
            fonte_label=FONTE_LABELS.get(r.fonte, r.fonte),
            total_entradas=r.total_entradas or 0,
            total_saidas=r.total_saidas or 0,
            saldo=r.saldo or 0,
            qtd_transacoes=r.qtd_transacoes or 0,
            qtd_entradas=r.qtd_entradas or 0,
            qtd_saidas=r.qtd_saidas or 0,
        )
        for r in results
    ]


@router.get("/meses")
def listar_meses_disponiveis(db: Session = Depends(get_db)):
    """Retorna lista de meses disponíveis"""
    meses = (
        db.query(Transacoes.ano_mes).distinct().order_by(desc(Transacoes.ano_mes)).all()
    )
    return [m.ano_mes for m in meses]


class DiaComTransacoes(BaseModel):
    data: date
    qtd_entradas: int
    qtd_saidas: int


@router.get("/dias-com-transacoes", response_model=List[DiaComTransacoes])
def listar_dias_com_transacoes(
    data_inicio: Optional[date] = Query(None, description="Data inicial (YYYY-MM-DD)"),
    data_fim: Optional[date] = Query(None, description="Data final (YYYY-MM-DD)"),
    categoria: Optional[str] = Query(None, description="Filtrar por categoria"),
    fonte: Optional[str] = Query(None, description="Filtrar por fonte"),
    db: Session = Depends(get_db),
):
    """Retorna lista de dias que possuem transações com contagem de entradas e saídas"""
    from sqlalchemy import case

    query = db.query(
        Transacoes.data_transacao,
        func.sum(case((Transacoes.is_entrada, 1), else_=0)).label("qtd_entradas"),
        func.sum(case((Transacoes.is_saida, 1), else_=0)).label("qtd_saidas"),
    )

    # Aplicar filtros antes do group by
    if categoria:
        query = query.filter(Transacoes.categoria_id == categoria)
    if fonte:
        query = query.filter(Transacoes.fonte == fonte)
    if data_inicio:
        query = query.filter(Transacoes.data_transacao >= data_inicio)
    if data_fim:
        query = query.filter(Transacoes.data_transacao <= data_fim)

    query = query.group_by(Transacoes.data_transacao)
    results = query.order_by(Transacoes.data_transacao).all()

    return [
        DiaComTransacoes(
            data=r.data_transacao,
            qtd_entradas=r.qtd_entradas or 0,
            qtd_saidas=r.qtd_saidas or 0,
        )
        for r in results
    ]


@router.get("/exportar")
def exportar_transacoes(
    categoria: Optional[str] = Query(None),
    fonte: Optional[str] = Query(None),
    ano_mes: Optional[str] = Query(None),
    tipo: Optional[str] = Query(None),
    busca: Optional[str] = Query(None),
    valor_min: Optional[float] = Query(None),
    valor_max: Optional[float] = Query(None),
    db: Session = Depends(get_db),
):
    """Retorna todas transações filtradas para exportação CSV"""
    query = db.query(Transacoes)

    if categoria:
        query = query.filter(Transacoes.categoria_id == categoria)
    if fonte:
        query = query.filter(Transacoes.fonte == fonte)
    if ano_mes:
        query = query.filter(Transacoes.ano_mes == ano_mes)
    if tipo == "entrada":
        query = query.filter(Transacoes.is_entrada == True)
    elif tipo == "saida":
        query = query.filter(Transacoes.is_saida == True)
    if busca:
        query = query.filter(Transacoes.descricao_original.ilike(f"%{busca}%"))
    if valor_min is not None:
        query = query.filter(Transacoes.valor_absoluto >= valor_min)
    if valor_max is not None:
        query = query.filter(Transacoes.valor_absoluto <= valor_max)

    transacoes = query.order_by(desc(Transacoes.data_transacao)).all()

    return [
        {
            "data": t.data_transacao.isoformat(),
            "descricao": t.descricao_original,
            "categoria": t.categoria_nome,
            "valor": float(t.valor),
            "tipo": "Entrada" if t.is_entrada else "Saída",
            "fonte": "Conta Corrente"
            if t.fonte == "conta_corrente"
            else "Cartão de Crédito",
            "beneficiario": t.beneficiario or "",
        }
        for t in transacoes
    ]
