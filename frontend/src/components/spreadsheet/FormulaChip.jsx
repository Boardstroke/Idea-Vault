import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import { TimeShift } from '../../lib/formulaParser'

/**
 * FormulaChip - Chip clicável para variável em fórmula
 * 
 * Features:
 * - Visual colorido distintivo
 * - Dropdown para time shifting
 * - Clique para editar/remover
 */

// Cores para diferentes variáveis
const CHIP_COLORS = [
  'bg-blue-100 text-blue-700 border-blue-200',
  'bg-emerald-100 text-emerald-700 border-emerald-200',
  'bg-purple-100 text-purple-700 border-purple-200',
  'bg-amber-100 text-amber-700 border-amber-200',
  'bg-rose-100 text-rose-700 border-rose-200',
  'bg-cyan-100 text-cyan-700 border-cyan-200',
]

export default function FormulaChip({ 
  variableName, 
  variableId,
  timeShift = TimeShift.SAME,
  colorIndex = 0,
  onTimeShiftChange,
  onRemove,
  editable = true,
}) {
  const [showDropdown, setShowDropdown] = useState(false)
  const chipRef = useRef(null)
  
  const colorClass = CHIP_COLORS[colorIndex % CHIP_COLORS.length]
  
  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (chipRef.current && !chipRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDropdown])
  
  const handleClick = (e) => {
    e.stopPropagation()
    if (editable) {
      setShowDropdown(!showDropdown)
    }
  }
  
  const handleTimeShiftSelect = (newShift) => {
    onTimeShiftChange?.(newShift)
    setShowDropdown(false)
  }
  
  const timeShiftLabel = {
    [TimeShift.SAME]: null,
    [TimeShift.PREVIOUS]: 'previous month',
    [TimeShift.NEXT]: 'next month',
  }[timeShift]
  
  return (
    <span ref={chipRef} className="relative inline-flex">
      <button
        onClick={handleClick}
        className={cn(
          "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-sm font-medium border",
          colorClass,
          editable && "cursor-pointer hover:opacity-80",
          !editable && "cursor-default"
        )}
      >
        <span>{variableName}</span>
        {timeShiftLabel && (
          <span className="text-xs opacity-70">{timeShiftLabel}</span>
        )}
        {editable && (
          <ChevronDown className="w-3 h-3 opacity-50" />
        )}
      </button>
      
      {/* Dropdown de time shift */}
      {showDropdown && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-popover border rounded-lg shadow-lg overflow-hidden min-w-[160px]">
          <div className="py-1">
            <button
              onClick={() => handleTimeShiftSelect(TimeShift.SAME)}
              className={cn(
                "w-full px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors",
                timeShift === TimeShift.SAME && "bg-accent"
              )}
            >
              Same month
            </button>
            <button
              onClick={() => handleTimeShiftSelect(TimeShift.PREVIOUS)}
              className={cn(
                "w-full px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors",
                timeShift === TimeShift.PREVIOUS && "bg-accent"
              )}
            >
              Previous month
            </button>
            <button
              onClick={() => handleTimeShiftSelect(TimeShift.NEXT)}
              className={cn(
                "w-full px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors",
                timeShift === TimeShift.NEXT && "bg-accent"
              )}
            >
              Next month
            </button>
          </div>
          
          {onRemove && (
            <>
              <div className="border-t" />
              <button
                onClick={() => {
                  onRemove()
                  setShowDropdown(false)
                }}
                className="w-full px-3 py-1.5 text-sm text-left text-destructive hover:bg-destructive/10 transition-colors"
              >
                Remove
              </button>
            </>
          )}
        </div>
      )}
    </span>
  )
}

/**
 * Renderiza fórmula com chips de variáveis
 */
export function FormulaDisplay({ tokens, variables, onTokenChange }) {
  // Cria mapa de variável para índice de cor
  const colorMap = new Map()
  let colorIdx = 0
  tokens.forEach(t => {
    if (t.type === 'variable' && !colorMap.has(t.variableId)) {
      colorMap.set(t.variableId, colorIdx++)
    }
  })
  
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {tokens.map((token, idx) => {
        if (token.type === 'variable') {
          return (
            <FormulaChip
              key={idx}
              variableName={token.variableName}
              variableId={token.variableId}
              timeShift={token.timeShift}
              colorIndex={colorMap.get(token.variableId)}
              onTimeShiftChange={(newShift) => onTokenChange?.(idx, { ...token, timeShift: newShift })}
              onRemove={() => onTokenChange?.(idx, null)}
              editable={!!onTokenChange}
            />
          )
        }
        
        // Operadores e números
        return (
          <span key={idx} className="text-sm">
            {token.raw}
          </span>
        )
      })}
    </span>
  )
}

