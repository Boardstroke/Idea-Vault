import { useRef, useEffect, useState, useCallback } from 'react'
import { ChevronDown, ChevronRight, Plus, Filter, GitBranch, Clock, Sigma, TrendingUp, Table2, Trash2, Pencil, Check, X, ArrowLeft } from 'lucide-react'
import { cn } from '../lib/utils'
import { useSpreadsheetStore, formatMonth } from '../hooks/useSpreadsheetStore'
import { useModelsStore } from '../hooks/useModelsStore'
import InlineVariableCreator from './spreadsheet/InlineVariableCreator'
import CellEditor from './spreadsheet/CellEditor'
import FormulaInput from './spreadsheet/FormulaInput'
import { getTypeIcon, getMidValue } from '../lib/typeDetector'

/**
 * CausalSpreadsheet - Spreadsheet estilo Causal.app
 * 
 * Layout unificado com scroll horizontal seamless
 * Fórmula editada inline na própria linha
 * 
 * @param {string} modelId - ID do modelo
 */
export default function CausalSpreadsheet({ modelId }) {
  const scrollContainerRef = useRef(null)
  
  const {
    variables,
    months,
    editingFormula,
    loadModelData,
    getModelData,
  } = useSpreadsheetStore()
  
  const { models, updateModel, deselectModel } = useModelsStore()
  const activeModel = models.find(m => m.id === modelId)
  
  // Carrega dados do modelo quando ele muda
  useEffect(() => {
    if (activeModel?.data) {
      loadModelData(activeModel.data)
    }
  }, [modelId]) // eslint-disable-line react-hooks/exhaustive-deps
  
  // Salva dados do modelo quando as variáveis mudam
  useEffect(() => {
    if (modelId && variables.length >= 0) {
      const modelData = getModelData()
      updateModel(modelId, { data: modelData })
    }
  }, [variables]) // eslint-disable-line react-hooks/exhaustive-deps
  
  const [dateRange, setDateRange] = useState("Jan '25 - Dec '26")
  const [collapsedGroups, setCollapsedGroups] = useState({})
  
  // Detecta grupos únicos e mantém ordem
  const groupOrder = ['entradas', 'saidas_fixas', 'saidas_variaveis', 'resultado', 'inputs', 'calculations']
  const uniqueGroups = [...new Set(variables.map(v => v.group))].sort((a, b) => {
    const indexA = groupOrder.indexOf(a)
    const indexB = groupOrder.indexOf(b)
    if (indexA === -1 && indexB === -1) return 0
    if (indexA === -1) return 1
    if (indexB === -1) return -1
    return indexA - indexB
  })
  
  // Labels amigáveis para os grupos
  const groupLabels = {
    'inputs': 'INPUTS',
    'calculations': 'CALCULATIONS',
    'entradas': '📥 ENTRADAS',
    'saidas_fixas': '📌 SAÍDAS FIXAS',
    'saidas_variaveis': '🔄 SAÍDAS VARIÁVEIS',
    'resultado': '💰 RESULTADO',
  }
  
  // Cores de fundo para grupos
  const groupColors = {
    'entradas': 'bg-emerald-500/5',
    'saidas_fixas': 'bg-orange-500/5',
    'saidas_variaveis': 'bg-amber-500/5',
    'resultado': 'bg-blue-500/5',
    'inputs': 'bg-muted/30',
    'calculations': 'bg-muted/30',
  }
  
  // Scroll horizontal com mouse wheel
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    
    const handleWheel = (e) => {
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault()
        container.scrollLeft += e.deltaX || e.deltaY
      }
    }
    
    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [])
  
  const toggleGroup = (group) => {
    setCollapsedGroups(prev => ({ ...prev, [group]: !prev[group] }))
  }
  
  // Encontra variável com fórmula sendo editada
  const editingFormulaVariable = editingFormula 
    ? variables.find(v => v.id === editingFormula)
    : null
  
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top Bar - Fórmula atual */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/20 flex-shrink-0">
        <button 
          onClick={deselectModel}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md hover:bg-muted transition-colors"
          title="Voltar para modelos"
        >
          <ArrowLeft className="w-4 h-4" />
          {activeModel?.name || 'Modelo'}
        </button>
        
        <div className="w-px h-6 bg-border mx-1" />
        
        <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md hover:bg-muted transition-colors border">
          <Filter className="w-4 h-4" />
          Views
        </button>
        <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md hover:bg-muted transition-colors border">
          <GitBranch className="w-4 h-4" />
          Scenarios
        </button>
        
        {/* Barra de fórmula */}
        <div className="flex-1 flex items-center gap-2 px-3 py-1.5 bg-background border rounded-md">
          {editingFormulaVariable ? (
            <>
              <span className="text-primary font-mono">ƒ</span>
              <span className="text-sm">{editingFormulaVariable.formula?.raw || 'No formula'}</span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Select a cell to see formula</span>
          )}
        </div>
        
        <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md hover:bg-muted transition-colors border">
          <Clock className="w-4 h-4" />
          {dateRange}
        </button>
      </div>
      
      {/* Toolbar de visualização */}
      <div className="flex items-center gap-1 px-4 py-1 border-b bg-muted/10 flex-shrink-0">
        <button className="p-1.5 rounded hover:bg-muted">
          <Table2 className="w-4 h-4" />
        </button>
        <button className="p-1.5 rounded hover:bg-muted">
          <TrendingUp className="w-4 h-4" />
        </button>
        <button className="p-1.5 rounded hover:bg-muted">
          <Sigma className="w-4 h-4" />
        </button>
        <div className="w-px h-4 bg-border mx-1" />
        <button className="px-2 py-1 text-xs rounded hover:bg-muted">Trend</button>
        <button className="px-2 py-1 text-xs rounded hover:bg-muted">Data</button>
        <button className="px-2 py-1 text-xs rounded hover:bg-muted">Formula</button>
      </div>
      
      {/* Spreadsheet principal */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-auto scroll-smooth scrollbar-seamless"
      >
        <div className="min-w-max">
          {/* Header com meses */}
          <div className="flex sticky top-0 z-20 bg-background border-b">
            {/* Colunas fixas no header */}
            <div className="sticky left-0 z-30 bg-background flex-shrink-0 w-[300px] border-r h-10" />
            <div className="sticky left-[300px] z-30 bg-background flex-shrink-0 w-[60px] border-r h-10" />
            <div className="sticky left-[360px] z-30 bg-background flex-shrink-0 w-[100px] border-r h-10 flex items-center justify-center sticky-shadow">
              <span className="text-xs font-medium text-muted-foreground">Formula</span>
            </div>
            
            {/* Meses */}
            {months.map((month) => (
              <div
                key={month}
                className="flex-shrink-0 w-[100px] h-10 flex items-center justify-center text-xs font-medium text-muted-foreground border-r"
              >
                {formatMonth(month)}
              </div>
            ))}
          </div>
          
          {/* Grupos dinâmicos */}
          {uniqueGroups.map((groupKey) => (
            <VariableGroup
              key={groupKey}
              title={groupLabels[groupKey] || groupKey.toUpperCase()}
              groupKey={groupKey}
              variables={variables.filter(v => v.group === groupKey)}
              months={months}
              collapsed={collapsedGroups[groupKey]}
              onToggle={() => toggleGroup(groupKey)}
              bgColor={groupColors[groupKey] || 'bg-muted/30'}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Grupo de variáveis com header e linhas
 */
function VariableGroup({ title, groupKey, variables, months, collapsed, onToggle, bgColor = 'bg-muted/30' }) {
  return (
    <div className="border-b">
      {/* Header do grupo */}
      <div className={cn("flex", bgColor)}>
        {/* Colunas fixas do grupo */}
        <div className={cn("sticky left-0 z-10 flex-shrink-0 w-[300px] border-r", bgColor)}>
          <button
            onClick={onToggle}
            className="flex items-center gap-2 w-full px-4 h-9 text-left"
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {title}
            </span>
            {variables.length > 0 && (
              <span className="text-xs text-muted-foreground">
                ({variables.length})
              </span>
            )}
          </button>
        </div>
        <div className={cn("sticky left-[300px] z-10 flex-shrink-0 w-[60px] border-r h-9", bgColor)} />
        <div className={cn("sticky left-[360px] z-10 flex-shrink-0 w-[100px] border-r h-9 sticky-shadow", bgColor)} />
        {/* Espaço para o resto das colunas */}
        <div className="flex-1 h-9" />
      </div>
      
      {/* Linhas das variáveis */}
      {!collapsed && (
        <>
          {variables.map((variable) => (
            <VariableRowUnified
              key={variable.id}
              variable={variable}
              months={months}
            />
          ))}
          
          {/* Botão para adicionar nova variável */}
          <div className="flex">
            <div className="sticky left-0 z-10 bg-background flex-shrink-0 w-[300px] border-r">
              <InlineVariableCreator group={groupKey} />
            </div>
            <div className="sticky left-[300px] z-10 bg-background flex-shrink-0 w-[60px] border-r h-10" />
            <div className="sticky left-[360px] z-10 bg-background flex-shrink-0 w-[100px] border-r h-10 sticky-shadow" />
            {months.map((month) => (
              <div key={month} className="flex-shrink-0 w-[100px] h-10 border-r" />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Linha unificada de variável (nome + sparkline + ações + células)
 */
function VariableRowUnified({ variable, months }) {
  const {
    editingCell,
    startEditing,
    stopEditing,
    editingFormula,
    startEditingFormula,
    stopEditingFormula,
    setFormula,
    getValue,
    removeVariable,
    renameVariable,
  } = useSpreadsheetStore()
  
  const [isHovered, setIsHovered] = useState(false)
  const [formulaInput, setFormulaInput] = useState('')
  const [isRenaming, setIsRenaming] = useState(false)
  const [nameInput, setNameInput] = useState(variable.name)
  const [isDeleting, setIsDeleting] = useState(false)
  const nameInputRef = useRef(null)
  
  const isEditingThisFormula = editingFormula === variable.id
  
  // Obtém valores para sparkline
  const sparklineValues = months.map(m => {
    const val = getValue(variable.id, m)
    return getMidValue(val) || 0
  })
  
  // Verifica se célula está sendo editada
  const isEditingCell = (monthKey) => {
    return editingCell?.variableId === variable.id && editingCell?.monthKey === monthKey
  }
  
  // Inicia edição de fórmula inline
  const handleFormulaClick = () => {
    if (isEditingThisFormula) {
      stopEditingFormula()
    } else {
      startEditingFormula(variable.id)
      setFormulaInput(variable.formula?.raw || '')
    }
  }
  
  // Salva fórmula
  const handleFormulaSave = () => {
    if (formulaInput.trim()) {
      setFormula(variable.id, formulaInput.trim())
    }
    stopEditingFormula()
  }
  
  // === Renomear ===
  const handleStartRename = () => {
    setNameInput(variable.name)
    setIsRenaming(true)
    setIsDeleting(false)
    setTimeout(() => nameInputRef.current?.focus(), 0)
  }
  
  const handleSaveRename = () => {
    if (nameInput.trim() && nameInput.trim() !== variable.name) {
      renameVariable(variable.id, nameInput.trim())
    }
    setIsRenaming(false)
  }
  
  const handleCancelRename = () => {
    setNameInput(variable.name)
    setIsRenaming(false)
  }
  
  const handleRenameKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSaveRename()
    } else if (e.key === 'Escape') {
      handleCancelRename()
    }
  }
  
  // === Excluir ===
  const handleStartDelete = () => {
    setIsDeleting(true)
    setIsRenaming(false)
  }
  
  const handleConfirmDelete = () => {
    removeVariable(variable.id)
  }
  
  const handleCancelDelete = () => {
    setIsDeleting(false)
  }
  
  return (
    <div
      className="flex border-b hover:bg-muted/20 transition-colors group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { 
        setIsHovered(false)
        // Não cancela se estiver editando/deletando
        if (!isRenaming && !isDeleting) {
          setIsDeleting(false)
        }
      }}
    >
      {/* Nome da variável (sticky) */}
      <div className="sticky left-0 z-10 bg-background flex-shrink-0 w-[300px] border-r flex items-center gap-2 px-4 h-10 transition-shadow">
        {/* Estado: Confirmando exclusão */}
        {isDeleting ? (
          <div className="flex items-center gap-2 flex-1">
            <span className="text-sm text-destructive">Excluir?</span>
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={handleConfirmDelete}
                className="p-1 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                title="Confirmar exclusão"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={handleCancelDelete}
                className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
                title="Cancelar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : isRenaming ? (
          /* Estado: Renomeando */
          <div className="flex items-center gap-2 flex-1">
            <TypeIcon type={variable.type} />
            <input
              ref={nameInputRef}
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={handleSaveRename}
              className="flex-1 text-sm bg-transparent border-b border-primary focus:outline-none"
            />
            <div className="flex items-center gap-1">
              <button
                onClick={handleSaveRename}
                className="p-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                title="Salvar"
              >
                <Check className="w-3 h-3" />
              </button>
              <button
                onClick={handleCancelRename}
                className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
                title="Cancelar"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        ) : (
          /* Estado: Normal */
          <>
            <TypeIcon type={variable.type} />
            <span className="flex-1 text-sm truncate">{variable.name}</span>
            
            {/* Ações inline */}
            <div className={cn(
              "flex items-center gap-1 transition-opacity",
              isHovered ? "opacity-100" : "opacity-0"
            )}>
              <button
                onClick={handleStartRename}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Renomear"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleStartDelete}
                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title="Excluir"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}
      </div>
      
      {/* Sparkline (sticky) */}
      <div className="sticky left-[300px] z-10 bg-background flex-shrink-0 w-[60px] border-r h-10 flex items-center justify-center">
        <MiniSparkline values={sparklineValues} />
      </div>
      
      {/* Ações / Formula indicator (sticky) */}
      <div className={cn(
        "sticky left-[360px] z-10 bg-background flex-shrink-0 border-r h-10 flex items-center justify-center transition-all sticky-shadow",
        isEditingThisFormula ? "w-[400px] bg-primary/5 ring-2 ring-primary ring-inset" : "w-[100px]"
      )}>
        {isEditingThisFormula ? (
          <FormulaInput
            value={formulaInput}
            onChange={setFormulaInput}
            onSubmit={handleFormulaSave}
            onCancel={stopEditingFormula}
            placeholder="Enter formula (e.g., $Revenue * 1.1)"
          />
        ) : (
          <button
            onClick={handleFormulaClick}
            className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
          >
            {variable.formula ? (
              <>
                <span className="text-primary">ƒ</span>
                <span>{countFormulas(variable)} Formula{countFormulas(variable) > 1 ? 's' : ''}</span>
              </>
            ) : (
              <>
                <Plus className="w-3 h-3" />
                <span>Data</span>
              </>
            )}
          </button>
        )}
      </div>
      
      {/* Células dos meses */}
      {months.map((month) => (
        <CellEditor
          key={month}
          variable={variable}
          monthKey={month}
          isEditing={isEditingCell(month)}
          onStartEdit={() => startEditing(variable.id, month)}
          onStopEdit={stopEditing}
        />
      ))}
    </div>
  )
}

/**
 * Conta fórmulas (base + overrides)
 */
function countFormulas(variable) {
  if (!variable.formula) return 0
  return 1 + Object.keys(variable.overrides || {}).length
}

/**
 * Ícone de tipo
 */
function TypeIcon({ type }) {
  const icon = getTypeIcon(type)
  
  const colorClass = {
    '$': 'bg-emerald-500/10 text-emerald-600',
    '%': 'bg-blue-500/10 text-blue-600',
    '#': 'bg-slate-500/10 text-slate-600',
  }[icon] || 'bg-slate-500/10 text-slate-600'
  
  return (
    <span className={cn(
      "flex items-center justify-center w-5 h-5 rounded text-xs font-bold",
      colorClass
    )}>
      {icon}
    </span>
  )
}

/**
 * Mini sparkline
 */
function MiniSparkline({ values }) {
  if (!values || values.length === 0) return null
  
  const filteredValues = values.filter(v => v > 0)
  if (filteredValues.length === 0) return null
  
  const max = Math.max(...filteredValues, 1)
  const min = Math.min(...filteredValues, 0)
  const range = max - min || 1
  
  const width = 50
  const height = 16
  const padding = 1
  
  const points = values.map((val, i) => {
    const x = padding + (i / (values.length - 1 || 1)) * (width - 2 * padding)
    const y = height - padding - ((val - min) / range) * (height - 2 * padding)
    return `${x},${y}`
  }).join(' ')
  
  return (
    <svg width={width} height={height} className="opacity-60">
      <polyline
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  )
}
