import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/utils'
import { useSpreadsheetStore } from '../../hooks/useSpreadsheetStore'
import { detectType, parseValue, formatValue, getMidValue } from '../../lib/typeDetector'

/**
 * CellEditor - Editor de célula individual
 * 
 * Features:
 * - Edição inline seamless
 * - Detecção automática de tipo pelo input
 * - Suporte a ranges ("5% to 10%")
 * - Visual diferenciado para fórmulas vs valores diretos
 */
export default function CellEditor({ 
  variable, 
  monthKey,
  isEditing,
  onStartEdit,
  onStopEdit,
}) {
  const { setValue, getValue, computeFormula } = useSpreadsheetStore()
  
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef(null)
  const cellRef = useRef(null)
  const rafRef = useRef(null)
  const [overlayStyle, setOverlayStyle] = useState(null)
  
  const value = getValue(variable.id, monthKey)
  const hasFormula = !!variable.formula
  const isOverride = hasFormula && variable.overrides[monthKey] !== undefined
  
  const updateOverlay = useCallback(() => {
    if (!cellRef.current) return
    const rect = cellRef.current.getBoundingClientRect()

    // Deixa uma margem pequena à direita para não encostar no edge / scrollbar.
    const rightPadding = 12
    const width = Math.max(160, window.innerWidth - rect.left - rightPadding)

    setOverlayStyle({
      left: rect.left,
      top: rect.top,
      width,
      height: rect.height,
    })
  }, [])

  // Foca e seleciona ao entrar em modo de edição
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
      
      // Prepara valor inicial para edição
      if (value !== null && value !== undefined) {
        const displayValue = formatValueForEdit(value, variable.type)
        setInputValue(displayValue)
      } else {
        setInputValue('')
      }
    }
  }, [isEditing, value, variable.type])

  // Atualiza a posição do overlay enquanto edita (scroll horizontal/vertical, resize)
  useEffect(() => {
    if (!isEditing) {
      setOverlayStyle(null)
      return
    }

    updateOverlay()

    const schedule = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        updateOverlay()
      })
    }

    window.addEventListener('resize', schedule, { passive: true })
    // Captura para pegar scrolls em containers (não só window)
    window.addEventListener('scroll', schedule, { passive: true, capture: true })

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
    }
  }, [isEditing, updateOverlay])
  
  const handleClick = useCallback(() => {
    if (!isEditing) {
      onStartEdit()
    }
  }, [isEditing, onStartEdit])
  
  const handleBlur = useCallback(() => {
    if (inputValue.trim()) {
      setValue(variable.id, monthKey, inputValue)
    }
    onStopEdit()
  }, [inputValue, setValue, variable.id, monthKey, onStopEdit])
  
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleBlur()
    } else if (e.key === 'Escape') {
      onStopEdit()
    } else if (e.key === 'Tab') {
      // Permite navegação com Tab
      handleBlur()
    }
  }, [handleBlur, onStopEdit])
  
  const handleChange = useCallback((e) => {
    setInputValue(e.target.value)
  }, [])
  
  // Formata valor para exibição
  const displayValue = value !== null && value !== undefined
    ? formatValue(value, variable.type)
    : '-'
  
  if (isEditing) {
    return (
      <>
        {/* Placeholder da célula (mantém grid alinhado) */}
        <div
          ref={cellRef}
          className="flex-shrink-0 w-[100px] h-10 flex items-center border-r bg-primary/5 ring-2 ring-primary ring-inset"
        />

        {/* Overlay que expande até o fim do layout à direita */}
        {overlayStyle && createPortal(
          <div
            className="fixed z-[9999] pointer-events-auto"
            style={{
              left: overlayStyle.left,
              top: overlayStyle.top,
              width: overlayStyle.width,
              height: overlayStyle.height,
            }}
          >
            <div className="h-full w-full flex items-center border border-primary/50 bg-background/95 backdrop-blur-sm shadow-lg">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={handleChange}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                className="w-full h-full px-3 text-sm text-right bg-transparent focus:outline-none"
                placeholder="-"
              />
            </div>
          </div>,
          document.body
        )}
      </>
    )
  }
  
  return (
    <div
      ref={cellRef}
      onClick={handleClick}
      className={cn(
        "flex-shrink-0 w-[100px] h-10 flex items-center justify-end px-2 text-sm cursor-pointer border-r transition-colors",
        "hover:bg-muted/50",
        hasFormula && !isOverride && "text-muted-foreground italic",
        isOverride && "bg-amber-500/10",
        value === null || value === undefined ? "text-muted-foreground" : ""
      )}
    >
      {displayValue}
    </div>
  )
}

/**
 * Formata valor para edição (sem formatação de moeda/porcentagem)
 */
function formatValueForEdit(value, type) {
  if (value === null || value === undefined) return ''
  
  // Range
  if (typeof value === 'object' && 'min' in value && 'max' in value) {
    if (type === 'percentage') {
      return `${(value.min * 100)}% to ${(value.max * 100)}%`
    }
    return `${value.min} to ${value.max}`
  }
  
  const num = typeof value === 'number' ? value : parseFloat(value) || 0
  
  switch (type) {
    case 'currency':
      return `$${num}`
    case 'percentage':
      return `${(num * 100)}%`
    default:
      return String(num)
  }
}

/**
 * CellDisplay - Célula somente leitura com sparkline opcional
 */
export function CellDisplay({ value, type, hasFormula, isOverride }) {
  const displayValue = value !== null && value !== undefined
    ? formatValue(value, type)
    : '-'
  
  return (
    <div
      className={cn(
        "w-[100px] h-full flex items-center justify-end px-2 text-sm border-l",
        hasFormula && !isOverride && "text-muted-foreground italic",
        isOverride && "bg-amber-500/10",
        value === null || value === undefined ? "text-muted-foreground" : ""
      )}
    >
      {displayValue}
    </div>
  )
}

