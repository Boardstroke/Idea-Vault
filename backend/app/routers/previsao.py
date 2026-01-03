from fastapi import APIRouter, Depends, Query, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import List, Optional
from pydantic import BaseModel
from decimal import Decimal
from datetime import date
from app.database import get_db
from app.models import PrevisaoGastos, SpendingForecast, GastosCategoria

router = APIRouter()


class PrevisaoResponse(BaseModel):
    ano_mes: str
    descricao: str
    valor_previsto: Decimal
    tipo_gasto: str
    confianca: str

    class Config:
        from_attributes = True


class PrevisaoResumoResponse(BaseModel):
    total_previsto: Decimal
    total_assinaturas: Decimal
    total_parcelas: Decimal
    total_variaveis: Decimal


@router.get("", response_model=List[PrevisaoResponse])
def listar_previsao(
    tipo: Optional[str] = Query(
        None, description="Filtrar por tipo (assinatura, parcela, variavel)"
    ),
    db: Session = Depends(get_db),
):
    """Retorna previsão de gastos"""
    query = db.query(PrevisaoGastos)

    if tipo:
        query = query.filter(PrevisaoGastos.tipo_gasto == tipo)

    return query.order_by(
        PrevisaoGastos.ordem_tipo, PrevisaoGastos.valor_previsto.desc()
    ).all()


@router.get("/resumo", response_model=PrevisaoResumoResponse)
def resumo_previsao(db: Session = Depends(get_db)):
    """Retorna resumo da previsão"""
    total = db.query(func.sum(PrevisaoGastos.valor_previsto)).scalar()

    assinaturas = (
        db.query(func.sum(PrevisaoGastos.valor_previsto))
        .filter(PrevisaoGastos.tipo_gasto == "assinatura")
        .scalar()
    )

    parcelas = (
        db.query(func.sum(PrevisaoGastos.valor_previsto))
        .filter(PrevisaoGastos.tipo_gasto == "parcela")
        .scalar()
    )

    variaveis = (
        db.query(func.sum(PrevisaoGastos.valor_previsto))
        .filter(PrevisaoGastos.tipo_gasto == "variavel")
        .scalar()
    )

    return PrevisaoResumoResponse(
        total_previsto=total or 0,
        total_assinaturas=assinaturas or 0,
        total_parcelas=parcelas or 0,
        total_variaveis=variaveis or 0,
    )


@router.get("/proximo-mes", response_model=List[PrevisaoResponse])
def previsao_proximo_mes(db: Session = Depends(get_db)):
    """Retorna previsão do próximo mês"""
    # Pegar o mês mais recente da previsão
    ultimo_mes = db.query(func.max(PrevisaoGastos.ano_mes)).scalar()

    return (
        db.query(PrevisaoGastos)
        .filter(PrevisaoGastos.ano_mes == ultimo_mes)
        .order_by(PrevisaoGastos.ordem_tipo, PrevisaoGastos.valor_previsto.desc())
        .all()
    )


# ============================================================
# ML-based Forecast Endpoints
# ============================================================


class MLForecastResponse(BaseModel):
    id: int
    categoria: str
    mes_referencia: date
    valor_previsto: Decimal
    intervalo_inferior: Optional[Decimal]
    intervalo_superior: Optional[Decimal]
    modelo_versao: str

    class Config:
        from_attributes = True


class MLForecastCategoryResponse(BaseModel):
    categoria: str
    previsoes: List[MLForecastResponse]
    historico: List[dict]
    total_previsto: Decimal


class TriggerResponse(BaseModel):
    message: str
    workflow_id: Optional[str] = None


@router.get("/ml", response_model=List[MLForecastResponse])
def listar_previsoes_ml(
    categoria: Optional[str] = Query(None, description="Filtrar por categoria"),
    modelo_versao: Optional[str] = Query(
        None, description="Filtrar por versão do modelo (ex: v2)"
    ),
    limite: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Retorna previsões geradas pelo modelo ML"""
    try:
        query = db.query(SpendingForecast)

        if categoria:
            query = query.filter(SpendingForecast.categoria == categoria)

        # Filtrar por versão do modelo (padrão: apenas V2)
        if modelo_versao:
            query = query.filter(
                SpendingForecast.modelo_versao.like(f"{modelo_versao}%")
            )
        else:
            # Por padrão, retornar apenas o modelo mais recente (V2)
            query = query.filter(SpendingForecast.modelo_versao.like("v2%"))

        # Subquery para pegar apenas a previsão mais recente por categoria/mês
        subquery = (
            db.query(
                SpendingForecast.categoria,
                SpendingForecast.mes_referencia,
                func.max(SpendingForecast.criado_em).label("max_criado"),
            )
            .filter(
                SpendingForecast.modelo_versao.like("v2%")  # Filtrar na subquery também
            )
            .group_by(SpendingForecast.categoria, SpendingForecast.mes_referencia)
            .subquery()
        )

        query = query.join(
            subquery,
            (SpendingForecast.categoria == subquery.c.categoria)
            & (SpendingForecast.mes_referencia == subquery.c.mes_referencia)
            & (SpendingForecast.criado_em == subquery.c.max_criado),
        )

        return (
            query.order_by(SpendingForecast.categoria, SpendingForecast.mes_referencia)
            .limit(limite)
            .all()
        )
    except Exception as e:
        # Tabela pode não existir ainda
        return []


@router.get("/ml/categorias")
def listar_categorias_disponiveis(db: Session = Depends(get_db)):
    """Retorna categorias disponíveis para previsão (apenas modelo V2)"""
    try:
        categorias = (
            db.query(SpendingForecast.categoria)
            .filter(SpendingForecast.modelo_versao.like("v2%"))
            .distinct()
            .all()
        )
        return [c[0] for c in categorias]
    except Exception:
        # Fallback para categorias do Gold
        categorias = db.query(GastosCategoria.categoria_nome).distinct().all()
        return [c[0] for c in categorias]


@router.get("/ml/categoria/{categoria}", response_model=MLForecastCategoryResponse)
def previsao_por_categoria(
    categoria: str,
    meses_historico: int = Query(6, ge=1, le=12),
    db: Session = Depends(get_db),
):
    """Retorna previsão detalhada para uma categoria específica (apenas modelo V2)"""
    try:
        # Buscar previsões apenas do modelo V2
        previsoes = (
            db.query(SpendingForecast)
            .filter(
                SpendingForecast.categoria == categoria,
                SpendingForecast.modelo_versao.like("v2%"),
            )
            .order_by(desc(SpendingForecast.criado_em))
            .limit(3)
            .all()
        )  # 3 meses de previsão

        if not previsoes:
            raise HTTPException(
                status_code=404, detail=f"Categoria '{categoria}' não encontrada"
            )

        # Buscar histórico
        historico = (
            db.query(GastosCategoria)
            .filter(GastosCategoria.categoria_nome == categoria)
            .order_by(desc(GastosCategoria.ano_mes))
            .limit(meses_historico)
            .all()
        )

        historico_data = [
            {
                "ano_mes": h.ano_mes,
                "valor": float(h.total_gasto),
                "qtd_transacoes": h.qtd_transacoes,
            }
            for h in reversed(historico)
        ]

        total_previsto = sum(p.valor_previsto for p in previsoes)

        return MLForecastCategoryResponse(
            categoria=categoria,
            previsoes=previsoes,
            historico=historico_data,
            total_previsto=total_previsto,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ml/resumo")
def resumo_previsoes_ml(db: Session = Depends(get_db)):
    """Retorna resumo das previsões ML (apenas modelo V2)"""
    try:
        # Total previsto por mês (apenas V2)
        previsoes_mes = (
            db.query(
                SpendingForecast.mes_referencia,
                func.sum(SpendingForecast.valor_previsto).label("total"),
            )
            .filter(SpendingForecast.modelo_versao.like("v2%"))
            .group_by(SpendingForecast.mes_referencia)
            .order_by(SpendingForecast.mes_referencia)
            .all()
        )

        # Última versão do modelo V2
        ultima_versao = (
            db.query(func.max(SpendingForecast.modelo_versao))
            .filter(SpendingForecast.modelo_versao.like("v2%"))
            .scalar()
        )

        # Total de categorias com previsão V2
        n_categorias = (
            db.query(func.count(func.distinct(SpendingForecast.categoria)))
            .filter(SpendingForecast.modelo_versao.like("v2%"))
            .scalar()
        )

        return {
            "modelo_versao": ultima_versao,
            "n_categorias": n_categorias,
            "previsoes_por_mes": [
                {"mes": str(p[0]), "total": float(p[1])} for p in previsoes_mes
            ],
            "total_geral": sum(float(p[1]) for p in previsoes_mes)
            if previsoes_mes
            else 0,
        }
    except Exception:
        return {
            "modelo_versao": None,
            "n_categorias": 0,
            "previsoes_por_mes": [],
            "total_geral": 0,
            "message": "Nenhuma previsão disponível. Execute o treinamento do modelo.",
        }


@router.post("/ml/trigger", response_model=TriggerResponse)
async def trigger_forecast_inference(
    background_tasks: BackgroundTasks, categorias: Optional[List[str]] = None
):
    """
    Dispara o workflow de inferência do modelo de previsão.
    Requer Temporal rodando.
    """
    try:
        # Importar temporalio apenas quando necessário
        from temporalio.client import Client

        async def run_workflow():
            client = await Client.connect("localhost:7233")

            from temporal.workflows.forecast_inference_workflow import (
                ForecastInferenceWorkflow,
                ForecastInferenceWorkflowInput,
            )

            handle = await client.start_workflow(
                ForecastInferenceWorkflow.run,
                ForecastInferenceWorkflowInput(
                    categories=categorias,
                    history_months=6,
                    write_to_db=True,
                ),
                id=f"forecast-api-trigger-{date.today().isoformat()}",
                task_queue="ml-pipeline",
            )
            return handle.id

        import asyncio

        workflow_id = asyncio.run(run_workflow())

        return TriggerResponse(
            message="Workflow de inferência iniciado com sucesso",
            workflow_id=workflow_id,
        )
    except ImportError:
        raise HTTPException(status_code=503, detail="Temporal client não disponível")
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Erro ao iniciar workflow: {str(e)}"
        )
