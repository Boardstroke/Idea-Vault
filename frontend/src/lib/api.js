const API_BASE = 'http://localhost:8000/api'

async function fetchAPI(endpoint) {
  const response = await fetch(`${API_BASE}${endpoint}`)
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }
  return response.json()
}

export const api = {
  // Balanço
  getBalanco: () => fetchAPI('/balanco'),
  getBalancoResumo: () => fetchAPI('/balanco/resumo'),
  
  // Categorias
  getCategorias: (anoMes) => fetchAPI(`/categorias${anoMes ? `?ano_mes=${anoMes}` : ''}`),
  getCategoriasResumo: () => fetchAPI('/categorias/resumo'),
  
  // Assinaturas
  getAssinaturas: (status) => fetchAPI(`/assinaturas${status ? `?status=${status}` : ''}`),
  getAssinaturasResumo: () => fetchAPI('/assinaturas/resumo'),
  getAssinaturasAtivas: () => fetchAPI('/assinaturas/ativas'),
  
  // Parcelas
  getParcelas: (status) => fetchAPI(`/parcelas${status ? `?status=${status}` : ''}`),
  getParcelasResumo: () => fetchAPI('/parcelas/resumo'),
  getParcelasEmAndamento: () => fetchAPI('/parcelas/em-andamento'),
  
  // Anomalias
  getAnomalias: (severidade) => fetchAPI(`/anomalias${severidade ? `?severidade=${severidade}` : ''}`),
  getAnomaliasResumo: () => fetchAPI('/anomalias/resumo'),
  getAnomaliasAlta: () => fetchAPI('/anomalias/alta-severidade'),
  
  // Previsão (regras)
  getPrevisao: (tipo) => fetchAPI(`/previsao${tipo ? `?tipo=${tipo}` : ''}`),
  getPrevisaoResumo: () => fetchAPI('/previsao/resumo'),
  
  // Previsão ML
  getPrevisaoML: (categoria) => fetchAPI(`/previsao/ml${categoria ? `?categoria=${categoria}` : ''}`),
  getPrevisaoMLResumo: () => fetchAPI('/previsao/ml/resumo'),
  getPrevisaoMLCategorias: () => fetchAPI('/previsao/ml/categorias'),
  getPrevisaoMLCategoria: (categoria, mesesHistorico = 6) => 
    fetchAPI(`/previsao/ml/categoria/${encodeURIComponent(categoria)}?meses_historico=${mesesHistorico}`),
  
  // Transações
  getTransacoes: (params = {}) => {
    const filteredParams = Object.fromEntries(
      Object.entries(params).filter(([_, v]) => v !== null && v !== '' && v !== undefined)
    )
    const query = new URLSearchParams(filteredParams).toString()
    return fetchAPI(`/transacoes${query ? `?${query}` : ''}`)
  },
  getTransacoesRecentes: (limit = 10) => fetchAPI(`/transacoes/recentes?limit=${limit}`),
  getTransacoesCategorias: () => fetchAPI('/transacoes/categorias'),
  getTransacoesMeses: () => fetchAPI('/transacoes/meses'),
  getTransacoesCategoriasStats: (params = {}) => {
    const filteredParams = Object.fromEntries(
      Object.entries(params).filter(([_, v]) => v !== null && v !== '' && v !== undefined)
    )
    const query = new URLSearchParams(filteredParams).toString()
    return fetchAPI(`/transacoes/categorias/stats${query ? `?${query}` : ''}`)
  },
  getTransacoesFontesStats: (params = {}) => {
    const filteredParams = Object.fromEntries(
      Object.entries(params).filter(([_, v]) => v !== null && v !== '' && v !== undefined)
    )
    const query = new URLSearchParams(filteredParams).toString()
    return fetchAPI(`/transacoes/fontes/stats${query ? `?${query}` : ''}`)
  },
  getTransacoesDias: (params = {}) => {
    const filteredParams = Object.fromEntries(
      Object.entries(params).filter(([_, v]) => v !== null && v !== '' && v !== undefined)
    )
    const query = new URLSearchParams(filteredParams).toString()
    return fetchAPI(`/transacoes/dias-com-transacoes${query ? `?${query}` : ''}`)
  },
  exportarTransacoes: (params = {}) => {
    const filteredParams = Object.fromEntries(
      Object.entries(params).filter(([_, v]) => v !== null && v !== '' && v !== undefined)
    )
    const query = new URLSearchParams(filteredParams).toString()
    return fetchAPI(`/transacoes/exportar${query ? `?${query}` : ''}`)
  },
  
  // Datasources
  getDatasources: (ativo) => fetchAPI(`/datasources${ativo !== undefined ? `?ativo=${ativo}` : ''}`),
  getDatasource: (id) => fetchAPI(`/datasources/${id}`),
  getDatasourceStats: (id) => fetchAPI(`/datasources/${id}/stats`),
  getDatasourceUploads: (id, limit = 20) => fetchAPI(`/datasources/${id}/uploads?limit=${limit}`),
  getUploadStatus: (workflowId) => fetchAPI(`/datasources/upload/${workflowId}/status`),
  
  uploadFile: async (datasourceId, file) => {
    const formData = new FormData()
    formData.append('file', file)
    
    const response = await fetch(`${API_BASE}/datasources/${datasourceId}/upload`, {
      method: 'POST',
      body: formData,
    })
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Upload failed' }))
      throw new Error(error.detail || `Upload error: ${response.status}`)
    }
    
    return response.json()
  },
}


