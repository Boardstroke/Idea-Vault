from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import balanco, categorias, assinaturas, parcelas, anomalias, previsao, transacoes, datasources

app = FastAPI(
    title="Dashboard Financeiro API",
    description="API para o Dashboard Financeiro Nubank",
    version="1.0.0"
)

# CORS para permitir acesso do frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrar routers
app.include_router(balanco.router, prefix="/api/balanco", tags=["Balanço"])
app.include_router(categorias.router, prefix="/api/categorias", tags=["Categorias"])
app.include_router(assinaturas.router, prefix="/api/assinaturas", tags=["Assinaturas"])
app.include_router(parcelas.router, prefix="/api/parcelas", tags=["Parcelas"])
app.include_router(anomalias.router, prefix="/api/anomalias", tags=["Anomalias"])
app.include_router(previsao.router, prefix="/api/previsao", tags=["Previsão"])
app.include_router(transacoes.router, prefix="/api/transacoes", tags=["Transações"])
app.include_router(datasources.router, prefix="/api/datasources", tags=["Datasources"])


@app.get("/")
def root():
    return {"message": "Dashboard Financeiro API", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "healthy"}


