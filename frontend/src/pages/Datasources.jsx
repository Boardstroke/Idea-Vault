import { useState, useEffect, useCallback, useRef } from 'react'
import { 
  Upload, Database, FileSpreadsheet, CheckCircle2, XCircle, Clock,
  RefreshCw, ChevronRight, AlertTriangle, FileUp, X, Loader2,
  Calendar, TrendingUp, History, Plus, CreditCard, Wallet, Building2,
  Link2, Zap, ChevronDown, Edit3, Trash2, Settings, MoreHorizontal,
  PlusCircle, Check
} from 'lucide-react'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { api } from '../lib/api'
import { formatCurrency, cn } from '../lib/utils'

// ============================================================
// Configuração das Instituições Financeiras
// ============================================================
const INSTITUTIONS = {
  nubank: {
    id: 'nubank',
    nome: 'Nubank',
    logo: '💜',
    cor: '#820AD1',
    bgLight: 'bg-violet-100 dark:bg-violet-900/30',
    bgSolid: 'bg-violet-600',
    textColor: 'text-violet-600 dark:text-violet-400',
    borderColor: 'border-violet-500',
    available: true,
    datasources: {
      extrato: { id: 'nubank_extrato', tipo: 'banco', label: 'Extrato Conta', icon: Wallet },
      fatura: { id: 'nubank_fatura', tipo: 'cartao', label: 'Fatura Cartão', icon: CreditCard },
    }
  },
  itau: {
    id: 'itau',
    nome: 'Itaú',
    logo: '🧡',
    cor: '#EC7000',
    bgLight: 'bg-orange-100 dark:bg-orange-900/30',
    bgSolid: 'bg-orange-500',
    textColor: 'text-orange-600 dark:text-orange-400',
    borderColor: 'border-orange-500',
    available: false,
    datasources: {
      extrato: { id: 'itau_extrato', tipo: 'banco', label: 'Extrato Conta', icon: Wallet },
      fatura: { id: 'itau_fatura', tipo: 'cartao', label: 'Fatura Cartão', icon: CreditCard },
    }
  },
  bradesco: {
    id: 'bradesco',
    nome: 'Bradesco',
    logo: '❤️',
    cor: '#CC092F',
    bgLight: 'bg-red-100 dark:bg-red-900/30',
    bgSolid: 'bg-red-600',
    textColor: 'text-red-600 dark:text-red-400',
    borderColor: 'border-red-500',
    available: false,
    datasources: {
      extrato: { id: 'bradesco_extrato', tipo: 'banco', label: 'Extrato Conta', icon: Wallet },
      fatura: { id: 'bradesco_fatura', tipo: 'cartao', label: 'Fatura Cartão', icon: CreditCard },
    }
  },
  inter: {
    id: 'inter',
    nome: 'Inter',
    logo: '🔶',
    cor: '#FF7A00',
    bgLight: 'bg-amber-100 dark:bg-amber-900/30',
    bgSolid: 'bg-amber-500',
    textColor: 'text-amber-600 dark:text-amber-400',
    borderColor: 'border-amber-500',
    available: false,
    datasources: {
      extrato: { id: 'inter_extrato', tipo: 'banco', label: 'Extrato Conta', icon: Wallet },
      fatura: { id: 'inter_fatura', tipo: 'cartao', label: 'Fatura Cartão', icon: CreditCard },
    }
  },
  c6: {
    id: 'c6',
    nome: 'C6 Bank',
    logo: '⬛',
    cor: '#242424',
    bgLight: 'bg-zinc-200 dark:bg-zinc-800',
    bgSolid: 'bg-zinc-800',
    textColor: 'text-zinc-700 dark:text-zinc-300',
    borderColor: 'border-zinc-600',
    available: false,
    datasources: {
      extrato: { id: 'c6_extrato', tipo: 'banco', label: 'Extrato Conta', icon: Wallet },
      fatura: { id: 'c6_fatura', tipo: 'cartao', label: 'Fatura Cartão', icon: CreditCard },
    }
  },
}

// ============================================================
// Card de Instituição Financeira
// ============================================================
function InstitutionCard({ institution, stats, onUpload, isSelected, onSelect }) {
  const totalTransacoes = (stats?.extrato?.total_transacoes || 0) + (stats?.fatura?.total_transacoes || 0)
  const totalUploads = (stats?.extrato?.total_uploads || 0) + (stats?.fatura?.total_uploads || 0)
  
  if (!institution.available) {
    return (
      <Card className="border border-zinc-200 dark:border-zinc-800 opacity-60">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-2xl", institution.bgLight)}>
                {institution.logo}
              </div>
              <div>
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {institution.nome}
                </h3>
                <p className="text-sm text-zinc-400">Conta e Cartão</p>
              </div>
            </div>
            <Badge variant="outline" className="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
              Em breve
            </Badge>
          </div>
          
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Clock className="h-4 w-4" />
            <span>Suporte chegando em breve</span>
          </div>
        </CardContent>
      </Card>
    )
  }
  
  return (
    <Card 
      className={cn(
        "cursor-pointer transition-all hover:shadow-lg border-2",
        isSelected 
          ? `${institution.borderColor} ring-2 ring-${institution.cor}/20` 
          : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
      )}
      onClick={() => onSelect(institution.id)}
    >
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-2xl", institution.bgLight)}>
              {institution.logo}
            </div>
            <div>
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                {institution.nome}
              </h3>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex items-center gap-1 text-xs text-zinc-500">
                  <Wallet className="h-3 w-3" />
                  <span>Conta</span>
                </div>
                <span className="text-zinc-300">•</span>
                <div className="flex items-center gap-1 text-xs text-zinc-500">
                  <CreditCard className="h-3 w-3" />
                  <span>Cartão</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-xs text-zinc-500">Ativo</span>
          </div>
        </div>
        
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Transações</p>
            <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
              {totalTransacoes.toLocaleString('pt-BR')}
            </p>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Uploads</p>
            <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
              {totalUploads}
            </p>
          </div>
        </div>
        
        {/* Breakdown by type */}
        <div className="flex items-center gap-4 text-xs text-zinc-500 mb-4 px-1">
          <div className="flex items-center gap-1.5">
            <Wallet className="h-3.5 w-3.5 text-zinc-400" />
            <span>{stats?.extrato?.total_transacoes || 0} transações</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CreditCard className="h-3.5 w-3.5 text-zinc-400" />
            <span>{stats?.fatura?.total_transacoes || 0} transações</span>
          </div>
        </div>
        
        {/* Upload button */}
        <Button 
          className={cn("w-full gap-2", institution.bgSolid, "hover:opacity-90 text-white")}
          onClick={(e) => { e.stopPropagation(); onUpload(institution); }}
        >
          <Upload className="h-4 w-4" />
          Upload CSV
        </Button>
      </CardContent>
    </Card>
  )
}

// ============================================================
// Card de Integração Direta (Open Finance)
// ============================================================
function IntegrationCard() {
  return (
    <Card className="border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/30">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-emerald-100 to-blue-100 dark:from-emerald-900/30 dark:to-blue-900/30">
              <Link2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                Integração Direta
              </h3>
              <p className="text-sm text-zinc-400">Open Finance</p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800">
            Em breve
          </Badge>
        </div>
        
        <p className="text-sm text-zinc-500 mb-4">
          Conecte suas contas diretamente e importe transações automaticamente via Open Finance.
        </p>
        
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          <span className="text-xs text-zinc-400">Sincronização automática</span>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// Modal de Upload com Seleção de Tipo
// ============================================================
function UploadModal({ institution, onClose, onSuccess }) {
  const [selectedTypes, setSelectedTypes] = useState([]) // 'extrato', 'fatura'
  const [files, setFiles] = useState({ extrato: null, fatura: null })
  const [accountName, setAccountName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [results, setResults] = useState(null)
  const [currentUpload, setCurrentUpload] = useState(null)
  
  const extratoInputRef = useRef(null)
  const faturaInputRef = useRef(null)
  const [dragActive, setDragActive] = useState({ extrato: false, fatura: false })
  
  const toggleType = (type) => {
    setSelectedTypes(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type]
    )
  }
  
  const handleDrag = (type) => (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(prev => ({ ...prev, [type]: true }))
    } else if (e.type === 'dragleave') {
      setDragActive(prev => ({ ...prev, [type]: false }))
    }
  }
  
  const handleDrop = (type) => (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(prev => ({ ...prev, [type]: false }))
    
    const droppedFile = e.dataTransfer?.files?.[0]
    if (droppedFile && droppedFile.name.endsWith('.csv')) {
      setFiles(prev => ({ ...prev, [type]: droppedFile }))
      if (!selectedTypes.includes(type)) {
        setSelectedTypes(prev => [...prev, type])
      }
      setError(null)
    } else {
      setError('Apenas arquivos CSV são aceitos')
    }
  }
  
  const handleFileSelect = (type) => (e) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFiles(prev => ({ ...prev, [type]: selectedFile }))
      setError(null)
    }
  }
  
  const handleUpload = async () => {
    if (selectedTypes.length === 0) {
      setError('Selecione pelo menos um tipo de arquivo')
      return
    }
    
    const hasFiles = selectedTypes.some(type => files[type])
    if (!hasFiles) {
      setError('Selecione pelo menos um arquivo')
      return
    }
    
    setUploading(true)
    setError(null)
    setResults({})
    
    for (const type of selectedTypes) {
      if (!files[type]) continue
      
      setCurrentUpload(type)
      const datasourceId = institution.datasources[type].id
      
      try {
        const response = await api.uploadFile(datasourceId, files[type])
        
        // Poll for status
        if (response.workflow_id) {
          let attempts = 0
          const maxAttempts = 60
          
          while (attempts < maxAttempts) {
            const status = await api.getUploadStatus(response.workflow_id)
            
            if (status.status === 'completed') {
              setResults(prev => ({ ...prev, [type]: { success: true, ...status } }))
              break
            } else if (status.status === 'failed') {
              setResults(prev => ({ ...prev, [type]: { success: false, error: status.erro } }))
              break
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000))
            attempts++
          }
          
          if (attempts >= maxAttempts) {
            setResults(prev => ({ ...prev, [type]: { success: false, error: 'Timeout' } }))
          }
        } else {
          setResults(prev => ({ ...prev, [type]: { success: true, ...response } }))
        }
      } catch (err) {
        setResults(prev => ({ ...prev, [type]: { success: false, error: err.message } }))
      }
    }
    
    setUploading(false)
    setCurrentUpload(null)
    onSuccess?.()
  }
  
  const formatBytes = (bytes) => {
    if (!bytes) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
  
  const hasResults = results && Object.keys(results).length > 0
  
  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-2xl", institution.bgLight)}>
                {institution.logo}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  Upload de Arquivos
                </h2>
                <p className="text-sm text-zinc-500">{institution.nome}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Account Name (optional) */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Nome da conta (opcional)
              </label>
              <input
                type="text"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="Ex: Conta Principal, Cartão Roxinho..."
                className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              />
              <p className="text-xs text-zinc-400 mt-1.5">
                Útil se você tiver mais de uma conta nesta instituição
              </p>
            </div>
            
            {/* Type Selection */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                Selecione o tipo de arquivo
              </label>
              <div className="grid grid-cols-2 gap-3">
                {/* Extrato */}
                <button
                  onClick={() => toggleType('extrato')}
                  className={cn(
                    "p-4 rounded-xl border-2 transition-all text-left",
                    selectedTypes.includes('extrato')
                      ? `${institution.borderColor} bg-opacity-10`
                      : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className={cn("p-2 rounded-lg", institution.bgLight)}>
                      <Wallet className={cn("h-5 w-5", institution.textColor)} />
                    </div>
                    <div className={cn(
                      "h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all",
                      selectedTypes.includes('extrato')
                        ? `${institution.bgSolid} border-transparent`
                        : "border-zinc-300 dark:border-zinc-600"
                    )}>
                      {selectedTypes.includes('extrato') && <Check className="h-3 w-3 text-white" />}
                    </div>
                  </div>
                  <h4 className="font-medium text-zinc-900 dark:text-zinc-100">Extrato Conta</h4>
                  <p className="text-xs text-zinc-500 mt-0.5">Movimentações da conta corrente</p>
                </button>
                
                {/* Fatura */}
                <button
                  onClick={() => toggleType('fatura')}
                  className={cn(
                    "p-4 rounded-xl border-2 transition-all text-left",
                    selectedTypes.includes('fatura')
                      ? `${institution.borderColor} bg-opacity-10`
                      : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className={cn("p-2 rounded-lg", institution.bgLight)}>
                      <CreditCard className={cn("h-5 w-5", institution.textColor)} />
                    </div>
                    <div className={cn(
                      "h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all",
                      selectedTypes.includes('fatura')
                        ? `${institution.bgSolid} border-transparent`
                        : "border-zinc-300 dark:border-zinc-600"
                    )}>
                      {selectedTypes.includes('fatura') && <Check className="h-3 w-3 text-white" />}
                    </div>
                  </div>
                  <h4 className="font-medium text-zinc-900 dark:text-zinc-100">Fatura Cartão</h4>
                  <p className="text-xs text-zinc-500 mt-0.5">Compras do cartão de crédito</p>
                </button>
              </div>
            </div>
            
            {/* File Upload Zones */}
            {selectedTypes.length > 0 && !hasResults && (
              <div className="space-y-4">
                {selectedTypes.includes('extrato') && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                      Arquivo de Extrato
                    </label>
                    <div
                      onDragEnter={handleDrag('extrato')}
                      onDragLeave={handleDrag('extrato')}
                      onDragOver={handleDrag('extrato')}
                      onDrop={handleDrop('extrato')}
                      onClick={() => extratoInputRef.current?.click()}
                      className={cn(
                        "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all",
                        dragActive.extrato 
                          ? `${institution.borderColor} bg-opacity-5` 
                          : "border-zinc-300 dark:border-zinc-700 hover:border-zinc-400",
                        files.extrato && "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20"
                      )}
                    >
                      <input
                        ref={extratoInputRef}
                        type="file"
                        accept=".csv"
                        onChange={handleFileSelect('extrato')}
                        className="hidden"
                      />
                      {files.extrato ? (
                        <div className="flex items-center justify-center gap-3">
                          <FileSpreadsheet className="h-8 w-8 text-emerald-500" />
                          <div className="text-left">
                            <p className="font-medium text-zinc-900 dark:text-zinc-100">{files.extrato.name}</p>
                            <p className="text-sm text-zinc-500">{formatBytes(files.extrato.size)}</p>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={(e) => { e.stopPropagation(); setFiles(prev => ({ ...prev, extrato: null })); }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <FileUp className="h-8 w-8 text-zinc-400" />
                          <p className="text-sm text-zinc-500">Arraste ou clique para selecionar</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {selectedTypes.includes('fatura') && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                      Arquivo de Fatura
                    </label>
                    <div
                      onDragEnter={handleDrag('fatura')}
                      onDragLeave={handleDrag('fatura')}
                      onDragOver={handleDrag('fatura')}
                      onDrop={handleDrop('fatura')}
                      onClick={() => faturaInputRef.current?.click()}
                      className={cn(
                        "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all",
                        dragActive.fatura 
                          ? `${institution.borderColor} bg-opacity-5` 
                          : "border-zinc-300 dark:border-zinc-700 hover:border-zinc-400",
                        files.fatura && "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20"
                      )}
                    >
                      <input
                        ref={faturaInputRef}
                        type="file"
                        accept=".csv"
                        onChange={handleFileSelect('fatura')}
                        className="hidden"
                      />
                      {files.fatura ? (
                        <div className="flex items-center justify-center gap-3">
                          <FileSpreadsheet className="h-8 w-8 text-emerald-500" />
                          <div className="text-left">
                            <p className="font-medium text-zinc-900 dark:text-zinc-100">{files.fatura.name}</p>
                            <p className="text-sm text-zinc-500">{formatBytes(files.fatura.size)}</p>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={(e) => { e.stopPropagation(); setFiles(prev => ({ ...prev, fatura: null })); }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <FileUp className="h-8 w-8 text-zinc-400" />
                          <p className="text-sm text-zinc-500">Arraste ou clique para selecionar</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Uploading State */}
            {uploading && (
              <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
                <div className="flex items-center gap-3 mb-2">
                  <Loader2 className="h-5 w-5 text-violet-500 animate-spin" />
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">
                    Processando {currentUpload === 'extrato' ? 'extrato' : 'fatura'}...
                  </p>
                </div>
                <p className="text-sm text-zinc-500">Isso pode levar alguns segundos.</p>
              </div>
            )}
            
            {/* Results */}
            {hasResults && (
              <div className="space-y-3">
                {results.extrato && (
                  <div className={cn(
                    "p-4 rounded-xl",
                    results.extrato.success ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-red-50 dark:bg-red-950/20"
                  )}>
                    <div className="flex items-center gap-2 mb-2">
                      <Wallet className="h-4 w-4 text-zinc-500" />
                      <span className="font-medium text-sm">Extrato</span>
                      {results.extrato.success ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 ml-auto" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 ml-auto" />
                      )}
                    </div>
                    {results.extrato.success ? (
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div>
                          <span className="font-bold text-emerald-600">{results.extrato.linhas_inseridas}</span>
                          <span className="text-zinc-500 ml-1">inseridas</span>
                        </div>
                        <div>
                          <span className="font-bold text-amber-600">{results.extrato.linhas_duplicadas}</span>
                          <span className="text-zinc-500 ml-1">duplicadas</span>
                        </div>
                        <div>
                          <span className="font-bold text-red-600">{results.extrato.linhas_erro}</span>
                          <span className="text-zinc-500 ml-1">erros</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-red-600">{results.extrato.error}</p>
                    )}
                  </div>
                )}
                
                {results.fatura && (
                  <div className={cn(
                    "p-4 rounded-xl",
                    results.fatura.success ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-red-50 dark:bg-red-950/20"
                  )}>
                    <div className="flex items-center gap-2 mb-2">
                      <CreditCard className="h-4 w-4 text-zinc-500" />
                      <span className="font-medium text-sm">Fatura</span>
                      {results.fatura.success ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 ml-auto" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 ml-auto" />
                      )}
                    </div>
                    {results.fatura.success ? (
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div>
                          <span className="font-bold text-emerald-600">{results.fatura.linhas_inseridas}</span>
                          <span className="text-zinc-500 ml-1">inseridas</span>
                        </div>
                        <div>
                          <span className="font-bold text-amber-600">{results.fatura.linhas_duplicadas}</span>
                          <span className="text-zinc-500 ml-1">duplicadas</span>
                        </div>
                        <div>
                          <span className="font-bold text-red-600">{results.fatura.linhas_erro}</span>
                          <span className="text-zinc-500 ml-1">erros</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-red-600">{results.fatura.error}</p>
                    )}
                  </div>
                )}
              </div>
            )}
            
            {/* Error */}
            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-950/20 rounded-xl flex items-center gap-3">
                <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}
          </div>
          
          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-zinc-200 dark:border-zinc-800">
            <Button variant="outline" onClick={onClose}>
              {hasResults ? 'Fechar' : 'Cancelar'}
            </Button>
            {!hasResults && (
              <Button 
                onClick={handleUpload} 
                disabled={selectedTypes.length === 0 || uploading || !selectedTypes.some(t => files[t])}
                className={cn("gap-2", institution.bgSolid, "hover:opacity-90 text-white")}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {uploading ? 'Processando...' : 'Fazer Upload'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ============================================================
// Componente de Histórico de Uploads
// ============================================================
function UploadHistory({ institution, stats, refresh }) {
  const [uploads, setUploads] = useState([])
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    async function fetchUploads() {
      if (!institution?.available) return
      
      setLoading(true)
      try {
        // Fetch uploads for both extrato and fatura
        const [extratoUploads, faturaUploads] = await Promise.all([
          api.getDatasourceUploads(institution.datasources.extrato.id, 5).catch(() => []),
          api.getDatasourceUploads(institution.datasources.fatura.id, 5).catch(() => [])
        ])
        
        // Combine and sort by date
        const combined = [
          ...extratoUploads.map(u => ({ ...u, tipo: 'extrato' })),
          ...faturaUploads.map(u => ({ ...u, tipo: 'fatura' }))
        ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        
        setUploads(combined.slice(0, 10))
      } catch (err) {
        console.error('Erro ao carregar uploads:', err)
      } finally {
        setLoading(false)
      }
    }
    
    fetchUploads()
  }, [institution, refresh])
  
  if (!institution?.available) {
    return (
      <div className="text-center py-12 text-zinc-500">
        <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>Selecione uma instituição para ver o histórico</p>
      </div>
    )
  }
  
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    )
  }
  
  if (uploads.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>Nenhum upload realizado</p>
      </div>
    )
  }
  
  const statusConfig = {
    pending: { color: 'bg-zinc-100 text-zinc-700', icon: Clock, label: 'Pendente' },
    processing: { color: 'bg-blue-100 text-blue-700', icon: RefreshCw, label: 'Processando' },
    completed: { color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2, label: 'Concluído' },
    failed: { color: 'bg-red-100 text-red-700', icon: XCircle, label: 'Falhou' },
  }
  
  return (
    <div className="space-y-3">
      {uploads.map((upload) => {
        const status = statusConfig[upload.status] || statusConfig.pending
        const StatusIcon = status.icon
        const TypeIcon = upload.tipo === 'extrato' ? Wallet : CreditCard
        
        return (
          <div 
            key={upload.id}
            className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <TypeIcon className="h-4 w-4 text-zinc-400" />
                <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100 truncate max-w-[180px]">
                  {upload.nome_arquivo}
                </span>
              </div>
              <Badge className={cn("text-xs", status.color)}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {status.label}
              </Badge>
            </div>
            
            <div className="grid grid-cols-4 gap-2 text-xs text-zinc-500 mb-2">
              <div>
                <span className="text-emerald-600 font-medium">{upload.linhas_inseridas}</span> novas
              </div>
              <div>
                <span className="text-amber-600 font-medium">{upload.linhas_duplicadas}</span> dup.
              </div>
              <div>
                <span className="text-red-600 font-medium">{upload.linhas_erro}</span> erro
              </div>
              <div>
                <span className="font-medium">{upload.total_linhas}</span> total
              </div>
            </div>
            
            <div className="text-xs text-zinc-400">
              {new Date(upload.created_at).toLocaleString('pt-BR')}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ============================================================
// Página Principal de Datasources
// ============================================================
export default function Datasources() {
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [selectedInstitution, setSelectedInstitution] = useState('nubank')
  const [uploadModal, setUploadModal] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  
  const institutions = Object.values(INSTITUTIONS)
  
  const fetchData = async () => {
    setLoading(true)
    try {
      // Fetch stats for available institutions
      const statsData = {}
      
      for (const inst of institutions.filter(i => i.available)) {
        try {
          const [extratoStats, faturaStats] = await Promise.all([
            api.getDatasourceStats(inst.datasources.extrato.id).catch(() => ({ total_transacoes: 0, total_uploads: 0 })),
            api.getDatasourceStats(inst.datasources.fatura.id).catch(() => ({ total_transacoes: 0, total_uploads: 0 }))
          ])
          
          statsData[inst.id] = {
            extrato: extratoStats,
            fatura: faturaStats
          }
        } catch (err) {
          console.error(`Erro ao carregar stats de ${inst.id}:`, err)
        }
      }
      
      setStats(statsData)
    } catch (err) {
      console.error('Erro ao carregar dados:', err)
    } finally {
      setLoading(false)
    }
  }
  
  useEffect(() => {
    fetchData()
  }, [refreshKey])
  
  const handleUploadSuccess = () => {
    setRefreshKey(k => k + 1)
  }
  
  const selectedInst = INSTITUTIONS[selectedInstitution]
  
  return (
    <div className="p-8 space-y-6 h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Datasources
          </h1>
          <p className="text-zinc-500 mt-1">
            Gerencie suas fontes de dados e faça upload de arquivos CSV
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => setRefreshKey(k => k + 1)}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </Button>
      </div>
      
      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        </div>
      )}
      
      {/* Content */}
      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Institutions Grid */}
          <div className="lg:col-span-2 space-y-6">
            {/* Available Institutions */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Instituições Financeiras
                </h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {institutions.filter(i => i.available).map((inst) => (
                  <InstitutionCard
                    key={inst.id}
                    institution={inst}
                    stats={stats[inst.id]}
                    onUpload={setUploadModal}
                    isSelected={selectedInstitution === inst.id}
                    onSelect={setSelectedInstitution}
                  />
                ))}
              </div>
            </div>
            
            {/* Coming Soon Institutions */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-zinc-500 uppercase tracking-wider">
                Em breve
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {institutions.filter(i => !i.available).map((inst) => (
                  <InstitutionCard
                    key={inst.id}
                    institution={inst}
                    stats={null}
                    onUpload={() => {}}
                    isSelected={false}
                    onSelect={() => {}}
                  />
                ))}
                
                {/* Integration Card */}
                <IntegrationCard />
              </div>
            </div>
          </div>
          
          {/* Upload History */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <History className="h-5 w-5" />
              Histórico de Uploads
            </h2>
            
            <Card>
              <CardContent className="p-4">
                <UploadHistory 
                  institution={selectedInst}
                  stats={stats[selectedInstitution]}
                  refresh={refreshKey}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
      
      {/* Upload Modal */}
      {uploadModal && (
        <UploadModal
          institution={uploadModal}
          onClose={() => setUploadModal(null)}
          onSuccess={handleUploadSuccess}
        />
      )}
    </div>
  )
}
