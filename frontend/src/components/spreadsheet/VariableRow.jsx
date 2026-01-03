import { useState, useMemo, useCallback } from 'react'
import { Plus, Camera, Pencil, GripVertical, Trash2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useSpreadsheetStore } from '../../hooks/useSpreadsheetStore'
import { getTypeIcon, formatValue, getMidValue } from '../../lib/typeDetector'
import CellEditor from './CellEditor'

/**
 * VariableRow - Linha de variável na planilha
 * 
 * Features:
 * - Ícone de tipo (#, %, $)
 * - Nome editável
 * - Sparkline de tendência
 * - Células editáveis
 * - Indicador de fórmula
 */
export default function VariableRow({ 
  variable, 
  months = [],
  showName = false,
  showCells = false,
}) {
  const {
    editingCell,
    startEditing,
    stopEditing,
    startEditingFormula,
    removeVariable,
    getValue,
  } = useSpreadsheetStore()
  
  const [isHovered, setIsHovered] = useState(false)
  const [isNameEditing, setIsNameEditing] = useState(false)
  
  // Obtém valores para sparkline
  const sparklineValues = useMemo(() => {
    if (!months.length) return []
    return months.map(m => {
      const val = getValue(variable.id, m)
      return getMidValue(val) || 0
    })
  }, [months, variable.id, getValue])
  
  // Verifica se a célula está sendo editada
  const isEditingCell = useCallback((monthKey) => {
    return editingCell?.variableId === variable.id && editingCell?.monthKey === monthKey
  }, [editingCell, variable.id])
  
  const handleStartCellEdit = useCallback((monthKey) => {
    startEditing(variable.id, monthKey)
  }, [startEditing, variable.id])
  
  const handleFormulaClick = useCallback(() => {
    startEditingFormula(variable.id)
  }, [startEditingFormula, variable.id])
  
  // Renderiza apenas o nome (coluna fixa)
  if (showName) {
    return (
      <div
        className="flex items-center h-[40px] border-b hover:bg-muted/30 transition-colors"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Área do nome */}
        <div className="w-[280px] flex items-center gap-2 px-4">
          {/* Ícone de tipo */}
          <TypeIcon type={variable.type} />
          
          {/* Nome da variável */}
          <span className="flex-1 text-sm truncate">
            {variable.name}
          </span>
          
          {/* Sparkline */}
          {sparklineValues.length > 0 && (
            <MiniSparkline values={sparklineValues} />
          )}
          
          {/* Ações ao hover */}
          {isHovered && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => removeVariable(variable.id)}
                className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
        
        {/* Área da fórmula */}
        <div className="w-[120px] flex items-center justify-center px-2 border-l">
          <FormulaIndicator 
            variable={variable} 
            onClick={handleFormulaClick}
          />
        </div>
      </div>
    )
  }
  
  // Renderiza apenas as células (área scrollável)
  if (showCells) {
    return (
      <div className="flex h-[40px] border-b">
        {months.map((month) => (
          <CellEditor
            key={month}
            variable={variable}
            monthKey={month}
            isEditing={isEditingCell(month)}
            onStartEdit={() => handleStartCellEdit(month)}
            onStopEdit={stopEditing}
          />
        ))}
      </div>
    )
  }
  
  return null
}

/**
 * Ícone de tipo da variável
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
 * Indicador de fórmula na linha
 */
function FormulaIndicator({ variable, onClick }) {
  const hasFormula = !!variable.formula
  
  if (hasFormula) {
    // Conta quantas fórmulas/overrides existem
    const formulaCount = Object.keys(variable.overrides).length + 1
    
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
      >
        <span className="text-primary">ƒ</span>
        <span>{formulaCount === 1 ? '1 Formula' : `${formulaCount} Formulas`}</span>
      </button>
    )
  }
  
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
    >
      <Plus className="w-3 h-3" />
      <span>Data</span>
    </button>
  )
}

/**
 * Mini sparkline para tendência
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
  
  // Determina tendência para cor
  const firstHalf = values.slice(0, Math.floor(values.length / 2))
  const secondHalf = values.slice(Math.floor(values.length / 2))
  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / (firstHalf.length || 1)
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / (secondHalf.length || 1)
  const trend = avgSecond > avgFirst ? 'up' : avgSecond < avgFirst ? 'down' : 'stable'
  
  const color = trend === 'up' ? '#3b82f6' : trend === 'down' ? '#22c55e' : '#6b7280'
  
  return (
    <svg width={width} height={height} className="opacity-60">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  )
}

