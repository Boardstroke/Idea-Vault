from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from sqlalchemy import (
    String,
    Numeric,
    Boolean,
    Date,
    DateTime,
    Integer,
    Text,
    BigInteger,
    ForeignKey,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


# ============================================================
# Ingestion Models
# ============================================================


class Datasource(Base):
    """Modelo para ingestion.datasources - Instituições financeiras suportadas"""

    __tablename__ = "datasources"
    __table_args__ = {"schema": "ingestion"}

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    nome: Mapped[str] = mapped_column(String(100))
    tipo: Mapped[str] = mapped_column(String(20))
    parser_id: Mapped[str] = mapped_column(String(50))
    formato_esperado: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    icone: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    cor: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Upload(Base):
    """Modelo para ingestion.uploads - Histórico de uploads"""

    __tablename__ = "uploads"
    __table_args__ = {"schema": "ingestion"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    datasource_id: Mapped[str] = mapped_column(
        String(50), ForeignKey("ingestion.datasources.id")
    )
    nome_arquivo: Mapped[str] = mapped_column(String(255))
    tamanho_bytes: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    periodo_inicio: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    periodo_fim: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    total_linhas: Mapped[int] = mapped_column(Integer, default=0)
    linhas_inseridas: Mapped[int] = mapped_column(Integer, default=0)
    linhas_duplicadas: Mapped[int] = mapped_column(Integer, default=0)
    linhas_erro: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    workflow_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    erro: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    detalhes: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class RawTransaction(Base):
    """Modelo para landing.raw_transactions - Transações brutas unificadas"""

    __tablename__ = "raw_transactions"
    __table_args__ = {"schema": "landing"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    datasource_id: Mapped[str] = mapped_column(String(50))
    transaction_hash: Mapped[str] = mapped_column(String(64), unique=True)
    data_transacao: Mapped[date] = mapped_column(Date)
    valor: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    dados_raw: Mapped[dict] = mapped_column(JSONB)
    upload_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("ingestion.uploads.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class BalancoMensal(Base):
    """Modelo para gold.gld_balanco_mensal"""

    __tablename__ = "gld_balanco_mensal"
    __table_args__ = {"schema": "gold"}

    ano_mes: Mapped[str] = mapped_column(String(7), primary_key=True)
    ano: Mapped[int] = mapped_column(Integer)
    mes: Mapped[int] = mapped_column(Integer)
    total_entradas: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    total_saidas: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    saldo_mensal: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    saldo_acumulado: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    saidas_conta_corrente: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    saidas_cartao_credito: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    total_transacoes: Mapped[int] = mapped_column(Integer)
    qtd_entradas: Mapped[int] = mapped_column(Integer)
    qtd_saidas: Mapped[int] = mapped_column(Integer)
    taxa_poupanca_pct: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(5, 1), nullable=True
    )
    ticket_medio_saida: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(15, 2), nullable=True
    )
    variacao_saidas_pct: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(5, 1), nullable=True
    )
    variacao_entradas_pct: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(5, 1), nullable=True
    )
    status_mes: Mapped[str] = mapped_column(String(20))


class GastosCategoria(Base):
    """Modelo para gold.gld_gastos_categoria"""

    __tablename__ = "gld_gastos_categoria"
    __table_args__ = {"schema": "gold"}

    # Composite primary key
    ano_mes: Mapped[str] = mapped_column(String(7), primary_key=True)
    categoria_id: Mapped[str] = mapped_column(String(50), primary_key=True)
    ano: Mapped[int] = mapped_column(Integer)
    mes: Mapped[int] = mapped_column(Integer)
    categoria_nome: Mapped[str] = mapped_column(String(100))
    total_gasto: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    qtd_transacoes: Mapped[int] = mapped_column(Integer)
    ticket_medio: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    menor_gasto: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    maior_gasto: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    percentual_do_total: Mapped[Decimal] = mapped_column(Numeric(5, 1))
    media_movel_3m: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(15, 2), nullable=True
    )
    variacao_pct: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(5, 1), nullable=True
    )
    tendencia: Mapped[str] = mapped_column(String(20))
    ranking_mes: Mapped[int] = mapped_column(Integer)
    acumulado_ano: Mapped[Decimal] = mapped_column(Numeric(15, 2))


class ResumoAssinaturas(Base):
    """Modelo para gold.gld_resumo_assinaturas"""

    __tablename__ = "gld_resumo_assinaturas"
    __table_args__ = {"schema": "gold"}

    assinatura_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    servico_nome: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(20))
    tipo_servico: Mapped[str] = mapped_column(String(50))
    tipo_cobranca: Mapped[str] = mapped_column(String(20))
    origem: Mapped[str] = mapped_column(String(20))
    meses_cobranca: Mapped[int] = mapped_column(Integer)
    total_cobrancas: Mapped[int] = mapped_column(Integer)
    valor_mensal: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    valor_minimo: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    valor_maximo: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    custo_anual_estimado: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    primeira_cobranca: Mapped[date] = mapped_column(Date)
    ultima_cobranca: Mapped[date] = mapped_column(Date)
    meses_sem_cobranca: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)


class Parcelas(Base):
    """Modelo para silver.fct_parcelas"""

    __tablename__ = "fct_parcelas"
    __table_args__ = {"schema": "silver"}

    compra_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    estabelecimento: Mapped[str] = mapped_column(String(200))
    categoria_id: Mapped[str] = mapped_column(String(50))
    categoria_nome: Mapped[str] = mapped_column(String(100))
    total_parcelas: Mapped[int] = mapped_column(Integer)
    parcelas_pagas: Mapped[int] = mapped_column(Integer)
    parcelas_restantes: Mapped[int] = mapped_column(Integer)
    valor_parcela: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    valor_total_compra: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    total_pago: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    valor_restante: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    status_compra: Mapped[str] = mapped_column(String(20))
    data_primeira_parcela: Mapped[date] = mapped_column(Date)
    data_ultima_parcela: Mapped[date] = mapped_column(Date)
    data_proxima_parcela: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    mes_inicio: Mapped[str] = mapped_column(String(7))
    mes_fim_previsto: Mapped[str] = mapped_column(String(7))


class Anomalias(Base):
    """Modelo para gold.gld_anomalias_ml"""

    __tablename__ = "gld_anomalias_ml"
    __table_args__ = {"schema": "gold"}

    transaction_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    data_transacao: Mapped[date] = mapped_column(Date)
    descricao_original: Mapped[str] = mapped_column(Text)
    beneficiario: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    categoria_nome: Mapped[str] = mapped_column(String(100))
    fonte: Mapped[str] = mapped_column(String(20))
    valor: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    media_categoria: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(15, 2), nullable=True
    )
    z_score: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    anomaly_score: Mapped[int] = mapped_column(Integer)
    is_anomaly: Mapped[bool] = mapped_column(Boolean)
    severidade: Mapped[str] = mapped_column(String(10))
    is_acima_p95: Mapped[bool] = mapped_column(Boolean)
    is_3x_media: Mapped[bool] = mapped_column(Boolean)
    is_primeiro_gasto_alto: Mapped[bool] = mapped_column(Boolean)
    is_fim_semana: Mapped[bool] = mapped_column(Boolean)
    ano_mes: Mapped[str] = mapped_column(String(7))


class PrevisaoGastos(Base):
    """Modelo para gold.gld_previsao_gastos"""

    __tablename__ = "gld_previsao_gastos"
    __table_args__ = {"schema": "gold"}

    # Usando rowid como PK já que não tem PK definida
    ano_mes: Mapped[str] = mapped_column(String(7), primary_key=True)
    descricao: Mapped[str] = mapped_column(String(200), primary_key=True)
    valor_previsto: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    tipo_gasto: Mapped[str] = mapped_column(String(20))
    confianca: Mapped[str] = mapped_column(String(10))
    meses_projetados: Mapped[int] = mapped_column(Integer)
    ordem_tipo: Mapped[int] = mapped_column(Integer)


class TopBeneficiarios(Base):
    """Modelo para gold.gld_top_beneficiarios"""

    __tablename__ = "gld_top_beneficiarios"
    __table_args__ = {"schema": "gold"}

    beneficiario_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    nome_beneficiario: Mapped[str] = mapped_column(String(200))
    total_transacoes: Mapped[int] = mapped_column(Integer)
    total_enviado: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    total_recebido: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    saldo_liquido: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    primeira_transacao: Mapped[date] = mapped_column(Date)
    ultima_transacao: Mapped[date] = mapped_column(Date)
    frequencia_classificacao: Mapped[str] = mapped_column(String(20))
    tipo_beneficiario: Mapped[str] = mapped_column(String(20))
    ticket_medio: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(15, 2), nullable=True
    )
    qtd_meses_ativo: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ranking_por_valor: Mapped[int] = mapped_column(Integer)
    ranking_por_frequencia: Mapped[int] = mapped_column(Integer)


class Transacoes(Base):
    """Modelo para silver.fct_transacoes"""

    __tablename__ = "fct_transacoes"
    __table_args__ = {"schema": "silver"}

    transaction_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    data_transacao: Mapped[date] = mapped_column(Date)
    valor: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    valor_absoluto: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    descricao_original: Mapped[str] = mapped_column(Text)
    tipo_transacao: Mapped[str] = mapped_column(String(50))
    beneficiario: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    is_entrada: Mapped[bool] = mapped_column(Boolean)
    is_saida: Mapped[bool] = mapped_column(Boolean)
    fonte: Mapped[str] = mapped_column(String(20))
    is_parcelado: Mapped[bool] = mapped_column(Boolean)
    parcela_atual: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_parcelas: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_iof: Mapped[bool] = mapped_column(Boolean)
    is_estorno: Mapped[bool] = mapped_column(Boolean)
    categoria_id: Mapped[str] = mapped_column(String(50))
    categoria_nome: Mapped[str] = mapped_column(String(100))

    # Campos de vendor (enriquecimento)
    vendor_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    vendor_nome: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    vendor_logo_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    vendor_icone: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    vendor_cor: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)

    ano: Mapped[int] = mapped_column(Integer)
    mes: Mapped[int] = mapped_column(Integer)
    dia_semana: Mapped[int] = mapped_column(Integer)
    ano_mes: Mapped[str] = mapped_column(String(7))
    is_fim_semana: Mapped[bool] = mapped_column(Boolean)


class SpendingForecast(Base):
    """Modelo para ml_output.spending_forecasts"""

    __tablename__ = "spending_forecasts"
    __table_args__ = {"schema": "ml_output"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    categoria: Mapped[str] = mapped_column(String(100))
    mes_referencia: Mapped[date] = mapped_column(Date)
    valor_previsto: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    intervalo_inferior: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(15, 2), nullable=True
    )
    intervalo_superior: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(15, 2), nullable=True
    )
    modelo_versao: Mapped[str] = mapped_column(String(50))
    criado_em: Mapped[datetime] = mapped_column(DateTime)
