# Spending Forecast

Sistema de previsão de gastos mensais por categoria usando **Transformers** em PyTorch.

## 📁 Estrutura do Módulo

```
spending_forecast/
├── config/           # Configurações e parâmetros padrão
├── data/             # Carregamento, preparação e normalização de dados
├── eval/             # Avaliação e métricas
├── inference/        # Carregamento de modelos e predições
├── models/           # Arquiteturas de modelos (V1, V2, baselines)
├── scripts/          # Scripts CLI para treino e inferência
├── split/            # Divisão temporal de dados
├── training/         # Loop de treino, losses, checkpointing
└── utils/            # Utilitários (logging, device, seeding)
```

---

## 🏗️ Arquiteturas de Modelo

O sistema implementa duas arquiteturas de Transformer para previsão de séries temporais, ambas baseadas em **encoder-only** com diferentes estratégias de agregação para gerar previsões multi-step.

### Visão Geral: Comparação V1 vs V2

| Aspecto | V1 (Pooling) | V2 (Forecast Tokens) |
|---------|--------------|----------------------|
| **Estratégia** | Encoder → Pooling → MLP | Encoder com query tokens |
| **Pooling** | attention / flatten / CLS | N/A (tokens diretos) |
| **Positional Encoding** | Sinusoidal fixo | Learnable ou sinusoidal |
| **Saída** | Todos horizontes de uma vez | Um token por horizonte |
| **Flexibilidade** | Menor | Maior (cada horizonte independente) |
| **Complexidade** | Menor | Ligeiramente maior |
| **Melhor para** | Datasets menores | Datasets maiores, horizontes longos |

---

### V1: SpendingTransformerV1 (Encoder + Pooling)

**Arquivo**: `models/forecast_v1.py`

#### Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                        ENTRADA                                   │
│  x_numeric: (B, S, 2)     [valor_norm, tendencia_norm]          │
│  categories: (B, S)       [IDs de categoria]                     │
│  months: (B, S)           [mês 1-12]                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      EMBEDDINGS                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Category    │  │ Month       │  │ Numeric Features        │  │
│  │ Embedding   │  │ Embedding   │  │ (valor + tendência)     │  │
│  │ (d_model/4) │  │ (d_model/4) │  │ (2 dims)                │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│         │                │                    │                  │
│         └────────────────┼────────────────────┘                  │
│                          ▼                                       │
│              Concatenate: (B, S, 2 + d_model/4 + d_model/4)     │
│                          │                                       │
│                          ▼                                       │
│              Input Projection: Linear → (B, S, d_model)          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 POSITIONAL ENCODING                              │
│                                                                  │
│  Se pooling_type="cls": adiciona CLS token no início            │
│                                                                  │
│  PE(pos, 2i)   = sin(pos / 10000^(2i/d_model))                  │
│  PE(pos, 2i+1) = cos(pos / 10000^(2i/d_model))                  │
│                                                                  │
│  Saída: (B, S, d_model) ou (B, S+1, d_model) com CLS            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 TRANSFORMER ENCODER                              │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  TransformerEncoderLayer × num_layers                   │    │
│  │  ┌─────────────────────────────────────────────────┐    │    │
│  │  │  Multi-Head Self-Attention (nhead=4)            │    │    │
│  │  │  + Residual + LayerNorm                         │    │    │
│  │  │  + FFN (dim_feedforward=128, GELU)              │    │    │
│  │  │  + Residual + LayerNorm                         │    │    │
│  │  └─────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  + Final LayerNorm                                               │
│                                                                  │
│  Saída: (B, S, d_model)                                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      POOLING                                     │
│                                                                  │
│  ┌─────────────────┬─────────────────┬─────────────────┐        │
│  │   "attention"   │    "flatten"    │      "cls"      │        │
│  ├─────────────────┼─────────────────┼─────────────────┤        │
│  │ AttentionPooling│ Reshape para    │ Usa embedding   │        │
│  │ com scores      │ (B, S×d_model)  │ do CLS token    │        │
│  │ learnable       │                 │ posição [0]     │        │
│  ├─────────────────┼─────────────────┼─────────────────┤        │
│  │ Saída: (B, D)   │ Saída: (B, S×D) │ Saída: (B, D)   │        │
│  └─────────────────┴─────────────────┴─────────────────┘        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PREDICTION HEADS                              │
│                                                                  │
│  ┌──────────────────────────┐  ┌──────────────────────────────┐ │
│  │       Mean Head (μ)      │  │      Variance Head (σ²)      │ │
│  │  Linear(pooled, D×2)     │  │  Linear(pooled, D)           │ │
│  │  GELU                    │  │  GELU                        │ │
│  │  Dropout                 │  │  Linear(D, pred_len)         │ │
│  │  Linear(D×2, pred_len)   │  │  Softplus (garante σ² > 0)   │ │
│  └──────────────────────────┘  └──────────────────────────────┘ │
│                                                                  │
│  Saída: μ (B, pred_len), σ² (B, pred_len) ou None               │
└─────────────────────────────────────────────────────────────────┘
```

#### Detalhes do Attention Pooling

O `AttentionPooling` aprende a ponderar cada timestep da sequência:

```python
# Estrutura interna
attention = Sequential(
    Linear(d_model, d_model // 2),  # Projeção
    Tanh(),                          # Não-linearidade
    Linear(d_model // 2, 1),         # Score por timestep
    Dropout(dropout)
)

# Forward
scores = attention(x)           # (B, S, 1) → (B, S)
weights = softmax(scores)       # Pesos normalizados
output = sum(x * weights)       # Média ponderada → (B, D)
```

#### Parâmetros

```python
SpendingTransformerV1(
    d_model=64,           # Dimensão do modelo (embedding size)
    nhead=4,              # Número de attention heads
    num_layers=2,         # Número de camadas do encoder
    dim_feedforward=128,  # Dimensão da FFN interna
    dropout=0.1,          # Taxa de dropout
    seq_len=6,            # Tamanho da janela de entrada (meses)
    pred_len=3,           # Horizonte de previsão (meses)
    n_categories=20,      # Número de categorias de gastos
    pooling_type="attention"  # attention | flatten | cls
)
```

#### Quando usar cada tipo de pooling

| Pooling | Características | Melhor para |
|---------|-----------------|-------------|
| `attention` | Aprende importância de cada timestep | **Recomendado** - bom equilíbrio |
| `flatten` | Preserva toda informação temporal | Datasets pequenos, sequências curtas |
| `cls` | Token especial como em BERT | Experimentação, transferência |

---

### V2: ForecastTransformerV2 (Forecast Tokens)

**Arquivo**: `models/forecast_v2.py`

#### Arquitetura

A V2 usa uma abordagem inspirada em **query tokens** (similar a DETR), onde tokens learnable representam cada passo futuro a ser previsto.

```
┌─────────────────────────────────────────────────────────────────┐
│                        ENTRADA                                   │
│  x_numeric: (B, S, 2)     [valor_norm, tendencia_norm]          │
│  categories: (B, S)       [IDs de categoria]                     │
│  months: (B, S)           [mês 1-12]                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              PROCESSAMENTO DO HISTÓRICO                          │
│                                                                  │
│  1. Embeddings (igual V1):                                      │
│     - Category Embedding: (B, S) → (B, S, d_model/4)            │
│     - Month Embedding: (B, S) → (B, S, d_model/4)               │
│                                                                  │
│  2. Concatenação + Projeção:                                    │
│     [x_numeric | cat_emb | month_emb] → Linear → (B, S, d_model)│
│                                                                  │
│  3. Positional Encoding (offset=0):                             │
│     history = PE(history, offset=0)                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FORECAST TOKENS                               │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  forecast_tokens: Parameter(1, pred_len, d_model)       │    │
│  │  - Inicializado com N(0, 0.02)                          │    │
│  │  - Expandido para batch: (B, pred_len, d_model)         │    │
│  │  - Positional Encoding com offset=seq_len               │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  forecast = PE(forecast_tokens, offset=seq_len)                 │
│                                                                  │
│  Cada token representa uma "query" para um horizonte futuro:    │
│  - Token 0 → previsão mês +1                                    │
│  - Token 1 → previsão mês +2                                    │
│  - Token 2 → previsão mês +3                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   CONCATENAÇÃO                                   │
│                                                                 │
│  full_sequence = [history | forecast]                           │
│                                                                  │
│  Layout: (B, S + P, d_model)                                    │
│                                                                  │
│  Exemplo com seq_len=6, pred_len=3:                             │
│  ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐        │
│  │ H₀  │ H₁  │ H₂  │ H₃  │ H₄  │ H₅  │ F₀  │ F₁  │ F₂  │        │
│  └─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘        │
│  ├────── History (dados) ──────┤├── Forecast (queries) ──┤      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 TRANSFORMER ENCODER                              │
│                                                                  │
│  Processa toda a sequência com self-attention:                  │
│  - Forecast tokens podem "ver" todo o histórico                 │
│  - Histórico pode "ver" forecast tokens (bidirecional)          │
│                                                                  │
│  Opcional: use_causal_history=True                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Máscara de atenção assimétrica:                         │    │
│  │ - History: causal (só vê passado)                       │    │
│  │ - History: não atende forecast                          │    │
│  │ - Forecast: vê tudo (history + outros forecasts)        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Saída: (B, S + P, d_model)                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              EXTRAÇÃO DOS FORECAST TOKENS                        │
│                                                                  │
│  forecast_output = encoded[:, seq_len:, :]   # (B, P, d_model)  │
│                                                                  │
│  Cada posição corresponde a um horizonte:                       │
│  - forecast_output[:, 0, :] → previsão h+1                      │
│  - forecast_output[:, 1, :] → previsão h+2                      │
│  - forecast_output[:, 2, :] → previsão h+3                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PREDICTION HEADS                              │
│                                                                  │
│  Aplicados independentemente a cada forecast token:             │
│                                                                  │
│  ┌──────────────────────────┐  ┌──────────────────────────────┐ │
│  │     Prediction Head      │  │      Variance Head           │ │
│  │  Linear(d_model, 1)      │  │  Linear(d_model, d_model/2)  │ │
│  │                          │  │  GELU                        │ │
│  │                          │  │  Linear(d_model/2, 1)        │ │
│  │                          │  │  Softplus                    │ │
│  └──────────────────────────┘  └──────────────────────────────┘ │
│                                                                  │
│  Saída: μ (B, pred_len), σ² (B, pred_len) ou None               │
└─────────────────────────────────────────────────────────────────┘
```

#### Positional Encoding: Learnable vs Sinusoidal

A V2 suporta dois tipos de positional encoding:

**Sinusoidal (Fixo)**
```python
# Fórmulas clássicas do Transformer original
PE(pos, 2i)   = sin(pos / 10000^(2i/d_model))
PE(pos, 2i+1) = cos(pos / 10000^(2i/d_model))
```

**Learnable (Recomendado)**
```python
# Embeddings aprendidos durante o treinamento
pe = Parameter(zeros(1, max_len, d_model))
init.normal_(pe, std=0.02)
```

#### Máscara Causal (Experimental)

Quando `use_causal_history=True`, aplica uma máscara de atenção:

```
         H₀  H₁  H₂  H₃  H₄  H₅  F₀  F₁  F₂
    H₀   ✓   ✗   ✗   ✗   ✗   ✗   ✗   ✗   ✗
    H₁   ✓   ✓   ✗   ✗   ✗   ✗   ✗   ✗   ✗
    H₂   ✓   ✓   ✓   ✗   ✗   ✗   ✗   ✗   ✗
    H₃   ✓   ✓   ✓   ✓   ✗   ✗   ✗   ✗   ✗
    H₄   ✓   ✓   ✓   ✓   ✓   ✗   ✗   ✗   ✗
    H₅   ✓   ✓   ✓   ✓   ✓   ✓   ✗   ✗   ✗
    F₀   ✓   ✓   ✓   ✓   ✓   ✓   ✓   ✓   ✓
    F₁   ✓   ✓   ✓   ✓   ✓   ✓   ✓   ✓   ✓
    F₂   ✓   ✓   ✓   ✓   ✓   ✓   ✓   ✓   ✓
```

#### Parâmetros

```python
ForecastTransformerV2(
    d_model=64,              # Dimensão do modelo
    nhead=4,                 # Número de attention heads
    num_layers=2,            # Número de camadas
    dim_feedforward=128,     # Dimensão da FFN
    dropout=0.1,             # Taxa de dropout
    seq_len=6,               # Janela de entrada
    pred_len=3,              # Horizonte de previsão
    n_categories=20,         # Categorias
    use_learnable_pe=True,   # PE learnable (recomendado)
    use_causal_history=False # Máscara causal (experimental)
)
```

---

### Sistema de Embeddings (Comum a V1 e V2)

Ambos os modelos usam o mesmo sistema de embeddings para representar os dados de entrada:

```
┌─────────────────────────────────────────────────────────────────┐
│                    SISTEMA DE EMBEDDINGS                         │
│                                                                  │
│  ENTRADA POR TIMESTEP:                                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ valor_normalizado (1) │ tendência_normalizada (1)        │   │
│  │ categoria_id          │ mês (1-12)                       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  PROCESSAMENTO:                                                  │
│                                                                  │
│  1. Category Embedding:                                         │
│     - Embedding(n_categories, d_model // 4)                     │
│     - Ex: 20 categorias → embedding de 16 dims                  │
│                                                                  │
│  2. Month Embedding:                                            │
│     - Embedding(13, d_model // 4)  # 0=padding, 1-12=meses     │
│     - Captura sazonalidade mensal                               │
│                                                                  │
│  3. Concatenação:                                               │
│     [valor_norm, tendência_norm, cat_emb, month_emb]            │
│     Dimensão: 2 + d_model/4 + d_model/4 = 2 + 32 = 34           │
│                                                                  │
│  4. Projeção:                                                   │
│     Linear(34, d_model) → (B, S, 64)                            │
└─────────────────────────────────────────────────────────────────┘
```

---

### Estimativa de Incerteza

Ambos os modelos podem retornar estimativas de incerteza através da variância:

```python
# Durante inferência
mu, var = model(x, categories, months, return_uncertainty=True)

# mu:  média da previsão (B, pred_len)
# var: variância da previsão (B, pred_len), sempre > 0 (Softplus)

# Intervalo de confiança 90%
z = 1.64
lower = mu - z * sqrt(var)
upper = mu + z * sqrt(var)
```

A incerteza é treinada com **Gaussian Negative Log-Likelihood**:

```python
# Loss function
NLL = 0.5 * (log(var) + (y - mu)² / var)
```

---

### Baselines

**Arquivo**: `models/baselines.py`

Implementações simples para comparação e sanity check:

| Baseline | Descrição | Fórmula |
|----------|-----------|---------|
| `last_value` | Repete o último valor | `pred = [x[-1]] * pred_len` |
| `moving_average` | Média dos últimos N valores | `pred = mean(x[-3:])` |
| `linear_trend` | Extrapolação linear | `pred = slope * t + intercept` |
| `seasonal_last_year` | Valor de 12 meses atrás | `pred = x[-12:-12+pred_len]` |

```python
from spending_forecast.models.baselines import get_baselines

for baseline in get_baselines():
    predictions = baseline.fn(history, pred_len=3)
    print(f"{baseline.name}: {predictions}")
```

---

### Inicialização de Pesos

Ambos os modelos usam **Xavier Uniform** para inicialização:

```python
def _init_weights(self):
    for p in self.parameters():
        if p.dim() > 1:
            nn.init.xavier_uniform_(p)
```

Exceções:
- **CLS token** (V1): `N(0, 0.02)`
- **Forecast tokens** (V2): `N(0, 0.02)`
- **Learnable PE** (V2): `N(0, 0.02)`

---

### 🎯 Guia: Qual Modelo Escolher?

```
┌─────────────────────────────────────────────────────────────────┐
│                    ÁRVORE DE DECISÃO                            │
│                                                                 │
│  Dataset pequeno (<1000 sequências)?                            │
│  ├─ SIM → V1 com pooling="attention"                            │
│  └─ NÃO ↓                                                       │
│                                                                 │
│  Horizonte de previsão longo (>3 meses)?                        │
│  ├─ SIM → V2 (melhor modelagem por horizonte)                   │
│  └─ NÃO ↓                                                       │
│                                                                 │
│  Precisa de interpretabilidade por horizonte?                   │
│  ├─ SIM → V2 (cada token = 1 horizonte)                         │
│  └─ NÃO ↓                                                       │
│                                                                 │
│  Prioriza simplicidade?                                         │
│  ├─ SIM → V1 com pooling="attention"                            │
│  └─ NÃO → V2 com use_learnable_pe=True                          │
└─────────────────────────────────────────────────────────────────┘
```

#### Recomendações por Cenário

| Cenário | Modelo Recomendado | Configuração |
|---------|-------------------|--------------|
| Produção geral | V1 | `pooling_type="attention"` |
| Experimentação | V2 | `use_learnable_pe=True` |
| Sequências curtas | V1 | `pooling_type="flatten"` |
| Máxima flexibilidade | V2 | `use_causal_history=True` |
| Baseline neural | V1 | `pooling_type="cls"` |

---

### 📐 Contagem de Parâmetros

Com configuração padrão (d_model=64, num_layers=2, n_categories=20):

| Componente | V1 | V2 |
|------------|-----|-----|
| Category Embedding | 320 | 320 |
| Month Embedding | 208 | 208 |
| Input Projection | 2,240 | 2,240 |
| Positional Encoding | 0 (buffer) | 576 (learnable) |
| Transformer Encoder | ~100K | ~100K |
| Pooling (attention) | 2,145 | N/A |
| Forecast Tokens | N/A | 192 |
| Prediction Heads | ~17K | ~2K |
| **Total Aproximado** | **~120K** | **~105K** |

---

### 💻 Exemplos de Uso dos Modelos

#### Criando um Modelo V1

```python
from spending_forecast.models import SpendingTransformerV1
import torch

# Criar modelo
model = SpendingTransformerV1(
    d_model=64,
    nhead=4,
    num_layers=2,
    seq_len=6,
    pred_len=3,
    n_categories=20,
    pooling_type="attention"
)

# Preparar inputs
batch_size = 8
x_numeric = torch.randn(batch_size, 6, 2)      # (B, seq_len, 2)
categories = torch.randint(0, 20, (batch_size, 6))  # (B, seq_len)
months = torch.randint(1, 13, (batch_size, 6))      # (B, seq_len)

# Forward pass
mu, var = model(x_numeric, categories, months, return_uncertainty=True)

print(f"Previsão média: {mu.shape}")      # (8, 3)
print(f"Previsão variância: {var.shape}") # (8, 3)
```

#### Criando um Modelo V2

```python
from spending_forecast.models import ForecastTransformerV2

model = ForecastTransformerV2(
    d_model=64,
    nhead=4,
    num_layers=2,
    seq_len=6,
    pred_len=3,
    n_categories=20,
    use_learnable_pe=True,
    use_causal_history=False
)

# Mesma interface de forward
mu, var = model(x_numeric, categories, months, return_uncertainty=True)
```

#### Usando a Factory

```python
from spending_forecast.models.factory import create_model

# Criar V1
model_v1 = create_model(
    model_arch="v1",
    n_categories=20,
    seq_len=6,
    pred_len=3,
    pooling_type="attention"
)

# Criar V2
model_v2 = create_model(
    model_arch="v2",
    n_categories=20,
    seq_len=6,
    pred_len=3,
    use_learnable_pe=True
)
```

#### Inferência com Intervalo de Confiança

```python
import numpy as np

model.eval()
with torch.no_grad():
    mu, var = model(x_numeric, categories, months, return_uncertainty=True)
    
    # Converter para numpy
    mu_np = mu.cpu().numpy()
    std_np = torch.sqrt(var).cpu().numpy()
    
    # Intervalo de confiança 90% (z=1.64)
    z = 1.64
    lower = mu_np - z * std_np
    upper = mu_np + z * std_np
    
    print(f"Previsão: {mu_np[0]}")
    print(f"IC 90%: [{lower[0]}, {upper[0]}]")
```

---

## 📊 Pipeline de Dados

### 1. Fetch (`data/fetch.py`)

Busca dados da camada Gold do data warehouse:

```sql
SELECT ano_mes, categoria_nome, total_gasto, qtd_transacoes, mes
FROM gold.gld_gastos_categoria
```

### 2. Prepare (`data/prepare.py`)

Normalização **per-category** usando z-score:

```python
df, category_mapping, scaler_params = prepare_data(df)
# scaler_params[categoria] = {mean, std, trend_mean, trend_std}
```

### 3. Create Sequences (`data/prepare.py`)

Cria janelas deslizantes para treinamento:

```python
sequences = create_sequences(df, category_mapping, seq_len=6, pred_len=3)
# Cada sequência:
# - x_numeric: (seq_len, 2) -> [valor_normalizado, tendencia_normalizada]
# - categories: (seq_len,) -> IDs de categoria
# - months: (seq_len,) -> mês (1-12)
# - y: (pred_len,) -> targets normalizados
```

### 4. DataLoaders (`data/datasets.py`)

Split train/val (80/20 por padrão):

```python
train_loader, val_loader, train_seqs, val_seqs = create_dataloaders(
    sequences, batch_size=32, train_ratio=0.8
)
```

---

## 🎯 Treinamento

### ForecastTrainer (`training/trainer.py`)

Orquestra todo o pipeline:

```python
from spending_forecast.training import ForecastTrainer

trainer = ForecastTrainer(
    db_url="postgresql://...",
    model_arch="v1",  # v1 ou v2
    seq_len=6,
    pred_len=3,
    d_model=64,
    epochs=100,
    patience=10,
    loss_type="gaussian_nll",  # gaussian_nll | mse
)

result = trainer.run(with_baselines=True)
```

### Funções de Loss (`training/losses.py`)

| Loss | Descrição |
|------|-----------|
| `gaussian_nll` | Gaussian Negative Log-Likelihood (com incerteza) |
| `mse` | Mean Squared Error (sem incerteza) |

### Early Stopping

- Patience configurável (default: 10 epochs)
- Salva melhor checkpoint automaticamente
- Learning rate scheduler com ReduceLROnPlateau

---

## 🔮 Inferência

### Carregando um Modelo (`inference/loader.py`)

```python
from spending_forecast.inference import load_model

bundle = load_model(
    model_path="models/forecast_transformer_latest.pt",
    # ou
    model_dir="models/",
    # ou
    use_mlflow=True,
    mlflow_model_name="spending-forecast-transformer",
    mlflow_stage="Production"
)
```

### Fazendo Previsões (`inference/predictor.py`)

```python
from spending_forecast.inference import ForecastPredictor

predictor = ForecastPredictor(bundle, z_score=1.64)  # 90% CI

# Previsão única
result = predictor.predict_single(
    categoria="Alimentação",
    history=np.array([1200, 1300, 1150, 1400, 1250, 1350]),
    return_uncertainty=True
)
# ForecastResult(categoria, forecast, lower_bound, upper_bound)

# Previsão com datas
forecasts = predictor.predict_with_dates(
    categoria="Alimentação",
    history=history,
    last_date="2025-06-01"
)
# [MonthlyForecast(categoria, mes_referencia, valor_previsto, ...)]

# Previsão em batch a partir de DataFrame
df_forecast = predictor.predict_dataframe(df_history)
```

---

## 📈 Avaliação

### Métricas (`eval/metrics.py`)

| Métrica | Descrição |
|---------|-----------|
| `mae` | Mean Absolute Error |
| `rmse` | Root Mean Squared Error |
| `wape` | Weighted Absolute Percentage Error |
| `smape` | Symmetric MAPE |
| `coverage` | Cobertura do intervalo de confiança |
| `horizon_metrics` | Métricas por horizonte (h1, h2, h3) |

---

## 🚀 CLI

### Treinar Modelo

```bash
# Modelo V1 com pooling por atenção
python -m spending_forecast.scripts.train --model-arch v1 --pooling-type attention

# Modelo V2 com forecast tokens
python -m spending_forecast.scripts.train --model-arch v2 --epochs 50

# Com baselines para comparação no MLflow
python -m spending_forecast.scripts.train --model-arch v1 --with-baselines

# Personalizado
python -m spending_forecast.scripts.train \
    --model-arch v2 \
    --seq-len 6 \
    --pred-len 3 \
    --d-model 64 \
    --num-layers 2 \
    --batch-size 32 \
    --learning-rate 0.001 \
    --epochs 100 \
    --patience 10 \
    --loss-type gaussian_nll
```

### Variáveis de Ambiente

| Variável | Default | Descrição |
|----------|---------|-----------|
| `DATABASE_URL` | `postgresql://...` | URL do banco de dados |
| `MODEL_DIR` | `models` | Diretório para salvar modelos |
| `MLFLOW_TRACKING_URI` | `http://localhost:5000` | URI do MLflow |
| `MLFLOW_EXPERIMENT` | `spending-forecast` | Nome do experimento |
| `MODEL_ARCH` | `v1` | Arquitetura do modelo |
| `SEQ_LEN` | `6` | Tamanho da sequência de entrada |
| `PRED_LEN` | `3` | Horizonte de previsão |

---

## 🔧 Configuração Padrão (`config/defaults.py`)

```python
# Sequências
SEQ_LEN = 6          # 6 meses de histórico
PRED_LEN = 3         # 3 meses de previsão

# Arquitetura
D_MODEL = 64
NHEAD = 4
NUM_LAYERS = 2
DIM_FEEDFORWARD = 128
DROPOUT = 0.1

# Treinamento
BATCH_SIZE = 32
LEARNING_RATE = 1e-3
EPOCHS = 100
PATIENCE = 10

# Loss
DEFAULT_LOSS_TYPE = "gaussian_nll"

# Pooling (V1)
DEFAULT_POOLING = "attention"

# MLflow
PRIMARY_METRIC = "mae_brl"
```

---

## 📦 Estrutura do Checkpoint

O modelo salvo (`.pt`) contém:

```python
{
    "model_state_dict": ...,    # Pesos do modelo
    "model_config": {
        "model_arch": "v1",
        "n_categories": 20,
        "seq_len": 6,
        "pred_len": 3,
        "d_model": 64,
        "num_layers": 2,
        "pooling_type": "attention"
    },
    "category_mapping": {"Alimentação": 0, ...},
    "reverse_category_mapping": {0: "Alimentação", ...},
    "scaler_params": {
        "Alimentação": {"mean": 1200, "std": 150, ...},
        ...
    }
}
```

---

## 🔄 Integração MLflow

- Logs de parâmetros, métricas por época, e métricas finais
- Registro de modelos no Model Registry
- Comparação automática com baselines
- Métrica primária: `mae_brl` (MAE em Reais)

---

## 📋 Fluxo Completo

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Gold DB   │ ──▶ │   Prepare   │ ──▶ │  Sequences  │
│  (fetch)    │     │ (normalize) │     │  (sliding)  │
└─────────────┘     └─────────────┘     └─────────────┘
                                              │
                                              ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Model     │ ◀── │   Train     │ ◀── │ DataLoader  │
│ (V1 ou V2)  │     │  (loop)     │     │ (batches)   │
└─────────────┘     └─────────────┘     └─────────────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│  Evaluate   │ ──▶ │   MLflow    │
│ (metrics)   │     │  (log)      │
└─────────────┘     └─────────────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│   Save      │ ──▶ │  Inference  │
│ (checkpoint)│     │ (predictor) │
└─────────────┘     └─────────────┘
```

