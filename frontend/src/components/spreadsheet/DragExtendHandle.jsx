import { useState, useRef, useCallback, useEffect } from 'react'
import { cn } from '../../lib/utils'
import { useSpreadsheetStore } from '../../hooks/useSpreadsheetStore'

/**
 * DragExtendHandle - Handle para arrastar e estender valores
 * 
 * Features:
 * - Aparece no canto da célula selecionada
 * - Arrasta para estender valor para múltiplas células
 * - Visual de preview durante drag
 */
export default function DragExtendHandle({
  variableId,
  startMonth,
  value,
  cellWidth = 100,
  onExtend,
}) {
  const { months, extendValue } = useSpreadsheetStore()
  
  const [isDragging, setIsDragging] = useState(false)
  const [dragEndMonth, setDragEndMonth] = useState(null)
  const handleRef = useRef(null)
  const startX = useRef(0)
  const startMonthIndex = useRef(0)
  
  const handleMouseDown = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    
    setIsDragging(true)
    startX.current = e.clientX
    startMonthIndex.current = months.indexOf(startMonth)
    
    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX.current
      const monthsDelta = Math.round(deltaX / cellWidth)
      const targetIndex = Math.max(0, Math.min(
        months.length - 1,
        startMonthIndex.current + monthsDelta
      ))
      setDragEndMonth(months[targetIndex])
    }
    
    const handleMouseUp = () => {
      setIsDragging(false)
      
      if (dragEndMonth && dragEndMonth !== startMonth) {
        extendValue(variableId, startMonth, dragEndMonth, value)
        onExtend?.(dragEndMonth)
      }
      
      setDragEndMonth(null)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [months, startMonth, cellWidth, variableId, value, dragEndMonth, extendValue, onExtend])
  
  // Calcula range de preview
  const previewRange = isDragging && dragEndMonth ? (() => {
    const startIdx = months.indexOf(startMonth)
    const endIdx = months.indexOf(dragEndMonth)
    return {
      start: Math.min(startIdx, endIdx),
      end: Math.max(startIdx, endIdx),
      count: Math.abs(endIdx - startIdx) + 1,
    }
  })() : null
  
  return (
    <>
      {/* Handle */}
      <div
        ref={handleRef}
        onMouseDown={handleMouseDown}
        className={cn(
          "absolute -right-1 -bottom-1 w-3 h-3 bg-primary border-2 border-background rounded-sm cursor-crosshair z-10",
          "hover:scale-125 transition-transform",
          isDragging && "scale-125"
        )}
        title="Drag to extend"
      />
      
      {/* Tooltip durante drag */}
      {isDragging && previewRange && (
        <div className="fixed z-50 px-2 py-1 bg-popover border rounded shadow-lg text-xs pointer-events-none"
          style={{
            left: handleRef.current?.getBoundingClientRect().right + 8,
            top: handleRef.current?.getBoundingClientRect().top,
          }}
        >
          Extending to {previewRange.count} months
        </div>
      )}
    </>
  )
}

/**
 * Overlay de preview durante drag
 */
export function DragPreviewOverlay({
  variableId,
  months,
  startIndex,
  endIndex,
  cellWidth,
  rowTop,
  rowHeight,
  scrollLeft,
}) {
  if (startIndex === null || endIndex === null) return null
  
  const left = Math.min(startIndex, endIndex) * cellWidth - scrollLeft
  const width = (Math.abs(endIndex - startIndex) + 1) * cellWidth
  
  return (
    <div
      className="absolute bg-primary/20 border-2 border-primary border-dashed pointer-events-none z-20"
      style={{
        left: `${left}px`,
        top: `${rowTop}px`,
        width: `${width}px`,
        height: `${rowHeight}px`,
      }}
    />
  )
}

