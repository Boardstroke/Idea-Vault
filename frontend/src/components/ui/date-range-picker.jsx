import { useState, useEffect, useRef, useMemo } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './button'
import { cn } from '../../lib/utils'

const DAYS_OF_WEEK = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

const PRESETS = [
  { label: 'Hoje', getValue: () => {
    const today = new Date()
    return { start: today, end: today }
  }},
  { label: 'Ontem', getValue: () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    return { start: yesterday, end: yesterday }
  }},
  { label: 'Últimos 7 dias', getValue: () => {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 6)
    return { start, end }
  }},
  { label: 'Últimos 30 dias', getValue: () => {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 29)
    return { start, end }
  }},
  { label: 'Este mês', getValue: () => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return { start, end }
  }},
  { label: 'Mês passado', getValue: () => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const end = new Date(now.getFullYear(), now.getMonth(), 0)
    return { start, end }
  }},
  { label: 'Este ano', getValue: () => {
    const now = new Date()
    const start = new Date(now.getFullYear(), 0, 1)
    const end = new Date(now.getFullYear(), 11, 31)
    return { start, end }
  }},
]

function formatDate(date) {
  if (!date) return ''
  // Se for string ISO, parse manualmente para evitar timezone issues
  if (typeof date === 'string') {
    const [year, month, day] = date.split('-').map(Number)
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
  }
  const d = date instanceof Date ? date : new Date(date)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function formatDateISO(date) {
  if (!date) return ''
  // Se já for uma string no formato ISO, retorna como está
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date
  }
  // Se for um objeto Date, usa os métodos locais
  const d = date instanceof Date ? date : new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Helper para extrair ano, mês, dia de forma segura
function getDateParts(date) {
  if (!date) return null
  if (typeof date === 'string') {
    // Se for string ISO, parse manualmente
    const [year, month, day] = date.split('-').map(Number)
    return { year, month: month - 1, day }
  }
  const d = date instanceof Date ? date : new Date(date)
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() }
}

function isSameDay(d1, d2) {
  const p1 = getDateParts(d1)
  const p2 = getDateParts(d2)
  if (!p1 || !p2) return false
  return p1.year === p2.year && p1.month === p2.month && p1.day === p2.day
}

function isInRange(date, start, end) {
  if (!date || !start || !end) return false
  const p = getDateParts(date)
  const s = getDateParts(start)
  const e = getDateParts(end)
  if (!p || !s || !e) return false
  
  const dVal = new Date(p.year, p.month, p.day).getTime()
  const sVal = new Date(s.year, s.month, s.day).getTime()
  const eVal = new Date(e.year, e.month, e.day).getTime()
  
  return dVal >= Math.min(sVal, eVal) && dVal <= Math.max(sVal, eVal)
}

// Componente para renderizar bolinhas de transações
function TransactionDots({ entradas, saidas, maxDots = 5 }) {
  // Limita o número de bolinhas para não sobrecarregar visualmente
  const entradasToShow = Math.min(entradas, maxDots)
  const saidasToShow = Math.min(saidas, maxDots)
  
  if (entradas === 0 && saidas === 0) return null
  
  return (
    <div className="flex gap-[1px] justify-center flex-wrap max-w-[28px]">
      {Array.from({ length: entradasToShow }).map((_, i) => (
        <div key={`e-${i}`} className="w-[4px] h-[4px] rounded-full bg-emerald-500" />
      ))}
      {Array.from({ length: saidasToShow }).map((_, i) => (
        <div key={`s-${i}`} className="w-[4px] h-[4px] rounded-full bg-rose-500" />
      ))}
    </div>
  )
}

export function DateRangePicker({ 
  startDate, 
  endDate, 
  onChange, 
  transactionDays = [],
  placeholder = 'Selecione um período',
  className 
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState(() => {
    if (endDate) return new Date(endDate)
    if (startDate) return new Date(startDate)
    return new Date()
  })
  const [selecting, setSelecting] = useState(null) // 'start' | 'end' | null
  const [tempStart, setTempStart] = useState(startDate)
  const [tempEnd, setTempEnd] = useState(endDate)
  const [hoverDate, setHoverDate] = useState(null)
  const [selectedPreset, setSelectedPreset] = useState(null)
  const containerRef = useRef(null)
  
  // Map de dias com transações para lookup rápido
  const transactionMap = useMemo(() => {
    const map = new Map()
    transactionDays.forEach(day => {
      const key = formatDateISO(day.data)
      map.set(key, { 
        qtdEntradas: day.qtd_entradas || 0, 
        qtdSaidas: day.qtd_saidas || 0 
      })
    })
    return map
  }, [transactionDays])
  
  // Fechar ao clicar fora
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
  // Reset temp values quando abrir
  useEffect(() => {
    if (isOpen) {
      setTempStart(startDate)
      setTempEnd(endDate)
      setSelecting(null)
      setSelectedPreset(null)
      if (endDate) setViewMonth(new Date(endDate))
      else if (startDate) setViewMonth(new Date(startDate))
    }
  }, [isOpen, startDate, endDate])
  
  // Gera dias do calendário
  const calendarDays = useMemo(() => {
    const year = viewMonth.getFullYear()
    const month = viewMonth.getMonth()
    
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    
    // Ajuste para começar na segunda-feira
    let startDayOfWeek = firstDay.getDay() - 1
    if (startDayOfWeek < 0) startDayOfWeek = 6
    
    const days = []
    
    // Dias do mês anterior
    const prevMonth = new Date(year, month, 0)
    const prevMonthDays = prevMonth.getDate()
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const day = prevMonthDays - i
      const prevYear = month === 0 ? year - 1 : year
      const prevMonthNum = month === 0 ? 12 : month
      const date = new Date(prevYear, prevMonthNum - 1, day)
      days.push({ day, date, isCurrentMonth: false })
    }
    
    // Dias do mês atual
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day)
      days.push({ day, date, isCurrentMonth: true })
    }
    
    // Dias do próximo mês
    const remainingDays = 42 - days.length
    for (let day = 1; day <= remainingDays; day++) {
      const nextYear = month === 11 ? year + 1 : year
      const nextMonth = month === 11 ? 0 : month + 1
      const date = new Date(nextYear, nextMonth, day)
      days.push({ day, date, isCurrentMonth: false })
    }
    
    return days
  }, [viewMonth])
  
  const handleDayClick = (date) => {
    setSelectedPreset(null)
    if (!tempStart || (tempStart && tempEnd)) {
      // Primeiro clique ou reset
      setTempStart(date)
      setTempEnd(null)
      setSelecting('end')
    } else {
      // Segundo clique
      const start = tempStart
      const end = date
      
      // Garante que start <= end
      if (new Date(start) > new Date(end)) {
        setTempStart(end)
        setTempEnd(start)
      } else {
        setTempEnd(end)
      }
      setSelecting(null)
    }
  }
  
  const handleApply = () => {
    if (tempStart) {
      onChange({
        startDate: formatDateISO(tempStart),
        endDate: tempEnd ? formatDateISO(tempEnd) : formatDateISO(tempStart)
      })
    }
    setIsOpen(false)
  }
  
  const handlePresetClick = (preset, index) => {
    const { start, end } = preset.getValue()
    setTempStart(start)
    setTempEnd(end)
    setViewMonth(end)
    setSelectedPreset(index)
    setSelecting(null)
  }
  
  const handleClear = () => {
    setTempStart(null)
    setTempEnd(null)
    setSelectedPreset(null)
    onChange({ startDate: null, endDate: null })
    setIsOpen(false)
  }
  
  const navigateMonth = (direction) => {
    setViewMonth(prev => {
      const newDate = new Date(prev)
      newDate.setMonth(newDate.getMonth() + direction)
      return newDate
    })
  }
  
  const today = new Date()
  
  // Para preview do range durante hover
  const previewEnd = selecting === 'end' && hoverDate ? hoverDate : tempEnd
  
  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Trigger Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "gap-2 min-w-[200px] justify-start font-normal",
          !startDate && "text-zinc-500"
        )}
      >
        <Calendar className="h-4 w-4" />
        {startDate && endDate ? (
          <span>{formatDate(startDate)} - {formatDate(endDate)}</span>
        ) : startDate ? (
          <span>{formatDate(startDate)}</span>
        ) : (
          <span>{placeholder}</span>
        )}
      </Button>
      
      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 z-50 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl flex">
          {/* Sidebar com presets */}
          <div className="w-[140px] border-r border-zinc-700 p-3 flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-2 px-2">
              Intervalos
            </span>
            <div className="flex flex-col gap-0.5">
              {PRESETS.map((preset, idx) => (
                <button
                  key={preset.label}
                  onClick={() => handlePresetClick(preset, idx)}
                  className={cn(
                    "px-2 py-1.5 text-xs text-left rounded-md transition-colors",
                    selectedPreset === idx
                      ? "bg-violet-600 text-white font-medium"
                      : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          
          {/* Calendário */}
          <div className="p-4 w-[280px]">
            {/* Header com navegação */}
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => navigateMonth(-1)}
                className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                <ChevronLeft className="h-4 w-4 text-zinc-400" />
              </button>
              <span className="text-sm font-semibold text-zinc-100">
                {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
              </span>
              <button
                onClick={() => navigateMonth(1)}
                className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                <ChevronRight className="h-4 w-4 text-zinc-400" />
              </button>
            </div>
            
            {/* Dias da semana */}
            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {DAYS_OF_WEEK.map(day => (
                <div key={day} className="text-center text-[10px] font-medium text-zinc-500 py-1">
                  {day}
                </div>
              ))}
            </div>
            
            {/* Grid de dias */}
            <div className="grid grid-cols-7 gap-0.5">
              {calendarDays.map(({ day, date, isCurrentMonth }, idx) => {
                const dateKey = formatDateISO(date)
                const transaction = transactionMap.get(dateKey)
                const isStart = isSameDay(date, tempStart)
                const isEnd = isSameDay(date, previewEnd)
                const inRange = isInRange(date, tempStart, previewEnd)
                const isToday = isSameDay(date, today)
                
                return (
                  <button
                    key={idx}
                    onClick={() => handleDayClick(date)}
                    onMouseEnter={() => selecting === 'end' && setHoverDate(date)}
                    onMouseLeave={() => setHoverDate(null)}
                    className={cn(
                      "relative h-10 w-full rounded-md text-xs transition-all",
                      "flex flex-col items-center justify-center gap-0.5",
                      !isCurrentMonth && "text-zinc-600",
                      isCurrentMonth && "text-zinc-300 hover:bg-zinc-800",
                      inRange && !isStart && !isEnd && "bg-violet-500/20",
                      (isStart || isEnd) && "bg-violet-500 text-white",
                      isToday && !isStart && !isEnd && "ring-1 ring-violet-400"
                    )}
                  >
                    <span className={cn(
                      "leading-none text-[11px]",
                      (isStart || isEnd) && "font-semibold"
                    )}>
                      {day}
                    </span>
                    
                    {/* Bolinhas de transação */}
                    {transaction && (
                      <TransactionDots 
                        entradas={transaction.qtdEntradas} 
                        saidas={transaction.qtdSaidas}
                        maxDots={3}
                      />
                    )}
                  </button>
                )
              })}
            </div>
            
            {/* Legenda - diretamente abaixo do calendário */}
            <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-zinc-800">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-[10px] text-zinc-500">Entradas</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-rose-500" />
                <span className="text-[10px] text-zinc-500">Saídas</span>
              </div>
            </div>
            
            {/* Ações */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-800">
              <button
                onClick={handleClear}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Limpar
              </button>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  className="text-xs h-8"
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleApply}
                  disabled={!tempStart}
                  className="text-xs h-8 bg-violet-600 hover:bg-violet-700 text-white"
                >
                  Aplicar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
