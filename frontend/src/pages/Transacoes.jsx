import { useState, useEffect, useCallback, useMemo, Fragment, useRef } from 'react'
import { 
  Search, Download, ChevronLeft, ChevronRight, X, TrendingUp, TrendingDown,
  Calendar, CreditCard, Wallet, ArrowDownLeft, ArrowUpRight, LayoutList,
  SlidersHorizontal, RotateCcw, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown,
  Check, AlertTriangle, Eye, FileText, CheckSquare, Square, Minus,
  Tag, Layers, CalendarDays, Table2, Grid3X3
} from 'lucide-react'
import { Card, CardContent } from '../components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { DateRangePicker } from '../components/ui/date-range-picker'
import { api } from '../lib/api'
import { formatCurrency, formatDate, cn } from '../lib/utils'

// ============================================================
// Helper para parse de datas ISO sem problemas de timezone
// ============================================================
function parseISODate(dateStr) {
  if (!dateStr) return null
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day, 12, 0, 0) // Meio-dia para evitar edge cases
}

function formatDateLong(dateStr) {
  const d = parseISODate(dateStr)
  if (!d) return dateStr
  let label = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function getTodayISO() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function getYesterdayISO() {
  const now = new Date()
  now.setDate(now.getDate() - 1)
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// ============================================================
// Configuração de cores por categoria
// ============================================================
const CATEGORY_COLORS = {
  'Alimentação': { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', dot: 'bg-orange-500' },
  'Transporte': { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
  'Moradia': { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', dot: 'bg-purple-500' },
  'Saúde': { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', dot: 'bg-red-500' },
  'Lazer': { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-700 dark:text-pink-300', dot: 'bg-pink-500' },
  'Educação': { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-700 dark:text-indigo-300', dot: 'bg-indigo-500' },
  'Compras Online': { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-700 dark:text-cyan-300', dot: 'bg-cyan-500' },
  'Assinaturas': { bg: 'bg-violet-100 dark:bg-violet-900/30', text: 'text-violet-700 dark:text-violet-300', dot: 'bg-violet-500' },
  'Serviços': { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  'Transferências': { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  'Investimentos': { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', dot: 'bg-green-500' },
  'Pagamentos': { bg: 'bg-slate-100 dark:bg-slate-900/30', text: 'text-slate-700 dark:text-slate-300', dot: 'bg-slate-500' },
  'default': { bg: 'bg-zinc-100 dark:bg-zinc-800', text: 'text-zinc-700 dark:text-zinc-300', dot: 'bg-zinc-500' },
}

const getCategoryColor = (categoria) => CATEGORY_COLORS[categoria] || CATEGORY_COLORS.default

// Threshold para highlight de valores altos (em reais)
const HIGH_VALUE_THRESHOLD = 500

// ============================================================
// Componente de Avatar do Vendor
// ============================================================
function VendorAvatar({ transacao, size = 'md' }) {
  const [imgError, setImgError] = useState(false)
  
  const sizes = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-base',
    lg: 'w-14 h-14 text-xl',
  }
  
  const hasVendor = transacao.vendor_id && transacao.vendor_logo_url
  
  // Se tem vendor com logo e não deu erro, mostra a imagem
  if (hasVendor && !imgError) {
    return (
      <div 
        className={cn(
          "rounded-xl overflow-hidden flex items-center justify-center bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700",
          sizes[size]
        )}
        style={transacao.vendor_cor ? { borderColor: transacao.vendor_cor + '40' } : {}}
      >
        <img 
          src={transacao.vendor_logo_url}
          alt={transacao.vendor_nome || ''}
          className="w-6 h-6 object-contain"
          onError={() => setImgError(true)}
        />
      </div>
    )
  }
  
  // Se tem vendor mas não tem logo ou deu erro, mostra emoji
  if (transacao.vendor_icone) {
    return (
      <div 
        className={cn(
          "rounded-xl flex items-center justify-center",
          sizes[size]
        )}
        style={{ backgroundColor: (transacao.vendor_cor || '#6366f1') + '20' }}
      >
        <span>{transacao.vendor_icone}</span>
      </div>
    )
  }
  
  // Fallback: ícone de entrada/saída
  return (
    <div className={cn(
      "rounded-xl flex items-center justify-center",
      sizes[size],
      transacao.is_entrada 
        ? "bg-emerald-100 dark:bg-emerald-900/30" 
        : "bg-rose-100 dark:bg-rose-900/30"
    )}>
      {transacao.is_entrada ? (
        <ArrowDownLeft className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <ArrowUpRight className="h-4 w-4 text-rose-600 dark:text-rose-400" />
      )}
    </div>
  )
}

// ============================================================
// Componente de Carrossel de Categorias
// ============================================================
function CategoryCarousel({ categories, selectedCategory, onSelect }) {
  const scrollRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
      setCanScrollLeft(scrollLeft > 0)
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10)
    }
  }

  useEffect(() => {
    checkScroll()
    const el = scrollRef.current
    if (el) {
      el.addEventListener('scroll', checkScroll)
      return () => el.removeEventListener('scroll', checkScroll)
    }
  }, [categories])

  const scroll = (direction) => {
    if (scrollRef.current) {
      const scrollAmount = 400
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      })
    }
  }

  // Drag handlers
  const handleMouseDown = (e) => {
    setIsDragging(true)
    setStartX(e.pageX - scrollRef.current.offsetLeft)
    setScrollLeft(scrollRef.current.scrollLeft)
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleMouseMove = (e) => {
    if (!isDragging) return
    e.preventDefault()
    const x = e.pageX - scrollRef.current.offsetLeft
    const walk = (x - startX) * 1.5
    scrollRef.current.scrollLeft = scrollLeft - walk
  }

  const handleMouseLeave = () => {
    setIsDragging(false)
  }

  if (!categories || categories.length === 0) return null

  return (
    <div className="relative">
      {/* Scroll buttons */}
      {canScrollLeft && (
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 flex items-center justify-center bg-white dark:bg-zinc-800 rounded-full shadow-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-all -ml-2"
        >
          <ChevronLeft className="h-5 w-5 text-zinc-600 dark:text-zinc-300" />
        </button>
      )}
      {canScrollRight && (
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 flex items-center justify-center bg-white dark:bg-zinc-800 rounded-full shadow-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-all -mr-2"
        >
          <ChevronRight className="h-5 w-5 text-zinc-600 dark:text-zinc-300" />
        </button>
      )}

      {/* Cards container with drag support */}
      <div
        ref={scrollRef}
        className={cn(
          "flex gap-3 overflow-x-auto scrollbar-hide py-2 px-1",
          isDragging ? "cursor-grabbing" : "cursor-grab"
        )}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Card "Todas" */}
        <button
          onClick={() => !isDragging && onSelect('')}
          className={cn(
            "flex-shrink-0 w-64 p-4 rounded-xl border transition-all hover:shadow-md select-none bg-white dark:bg-zinc-800",
            !selectedCategory
              ? "border-zinc-900 dark:border-zinc-100 ring-1 ring-zinc-900 dark:ring-zinc-100"
              : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
          )}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={cn(
              "h-3 w-3 rounded-full",
              !selectedCategory ? "bg-zinc-900 dark:bg-zinc-100" : "bg-zinc-400"
            )} />
            <span className={cn(
              "font-semibold text-sm",
              !selectedCategory ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-700 dark:text-zinc-300"
            )}>
              Todas Categorias
            </span>
          </div>
          <div className="flex justify-between text-left">
            <div>
              <p className="text-[10px] text-zinc-400 uppercase tracking-wide">Entradas</p>
              <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(categories.reduce((sum, c) => sum + parseFloat(c.total_entradas), 0))}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-zinc-400 uppercase tracking-wide">Saídas</p>
              <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                {formatCurrency(categories.reduce((sum, c) => sum + parseFloat(c.total_saidas), 0))}
              </p>
            </div>
          </div>
        </button>

        {/* Cards de categorias */}
        {categories.map((cat) => {
          const colors = getCategoryColor(cat.categoria_nome)
          const isSelected = selectedCategory === cat.categoria_id
          
          return (
            <button
              key={cat.categoria_id}
              onClick={() => !isDragging && onSelect(cat.categoria_id)}
              className={cn(
                "flex-shrink-0 w-64 p-4 rounded-xl border transition-all hover:shadow-md text-left select-none bg-white dark:bg-zinc-800",
                isSelected
                  ? "border-zinc-900 dark:border-zinc-100 ring-1 ring-zinc-900 dark:ring-zinc-100"
                  : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={cn("h-3 w-3 rounded-full", colors.dot)} />
                  <span className={cn(
                    "font-semibold text-sm truncate",
                    isSelected ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-700 dark:text-zinc-300"
                  )}>
                    {cat.categoria_nome}
                  </span>
                </div>
                {isSelected && (
                  <Check className="h-4 w-4 text-zinc-900 dark:text-zinc-100" />
                )}
              </div>
              <div className="flex justify-between">
                <div>
                  <p className="text-[10px] text-zinc-400 uppercase tracking-wide">Entradas</p>
                  <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(parseFloat(cat.total_entradas))}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-zinc-400 uppercase tracking-wide">Saídas</p>
                  <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                    {formatCurrency(parseFloat(cat.total_saidas))}
                  </p>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================
// Componente de Carrossel de Datasources (Fontes)
// ============================================================
const FONTE_CONFIG = {
  conta_corrente: {
    label: 'Nubank - Conta Corrente',
    icon: Wallet,
    bgLight: 'bg-violet-100 dark:bg-violet-900/30',
    textColor: 'text-violet-600 dark:text-violet-400',
    dot: 'bg-violet-500',
  },
  cartao_credito: {
    label: 'Nubank - Cartão de Crédito',
    icon: CreditCard,
    bgLight: 'bg-violet-100 dark:bg-violet-900/30',
    textColor: 'text-violet-600 dark:text-violet-400',
    dot: 'bg-violet-500',
  },
}

function DatasourceCarousel({ fontes, selectedFonte, onSelect }) {
  const scrollRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
      setCanScrollLeft(scrollLeft > 0)
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10)
    }
  }

  useEffect(() => {
    checkScroll()
    const el = scrollRef.current
    if (el) {
      el.addEventListener('scroll', checkScroll)
      return () => el.removeEventListener('scroll', checkScroll)
    }
  }, [fontes])

  const scroll = (direction) => {
    if (scrollRef.current) {
      const scrollAmount = 400
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      })
    }
  }

  // Drag handlers
  const handleMouseDown = (e) => {
    setIsDragging(true)
    setStartX(e.pageX - scrollRef.current.offsetLeft)
    setScrollLeft(scrollRef.current.scrollLeft)
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleMouseMove = (e) => {
    if (!isDragging) return
    e.preventDefault()
    const x = e.pageX - scrollRef.current.offsetLeft
    const walk = (x - startX) * 1.5
    scrollRef.current.scrollLeft = scrollLeft - walk
  }

  const handleMouseLeave = () => {
    setIsDragging(false)
  }

  if (!fontes || fontes.length === 0) return null

  return (
    <div className="relative">
      {/* Scroll buttons */}
      {canScrollLeft && (
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 flex items-center justify-center bg-white dark:bg-zinc-800 rounded-full shadow-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-all -ml-2"
        >
          <ChevronLeft className="h-5 w-5 text-zinc-600 dark:text-zinc-300" />
        </button>
      )}
      {canScrollRight && (
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 flex items-center justify-center bg-white dark:bg-zinc-800 rounded-full shadow-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-all -mr-2"
        >
          <ChevronRight className="h-5 w-5 text-zinc-600 dark:text-zinc-300" />
        </button>
      )}

      {/* Cards container with drag support */}
      <div
        ref={scrollRef}
        className={cn(
          "flex gap-3 overflow-x-auto scrollbar-hide py-2 px-1",
          isDragging ? "cursor-grabbing" : "cursor-grab"
        )}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Card "Todas fontes" */}
        <button
          onClick={() => !isDragging && onSelect('')}
          className={cn(
            "flex-shrink-0 w-64 p-4 rounded-xl border transition-all hover:shadow-md select-none bg-white dark:bg-zinc-800",
            !selectedFonte
              ? "border-zinc-900 dark:border-zinc-100 ring-1 ring-zinc-900 dark:ring-zinc-100"
              : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
          )}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={cn(
              "p-1.5 rounded-lg",
              !selectedFonte ? "bg-zinc-900 dark:bg-zinc-100" : "bg-zinc-100 dark:bg-zinc-700"
            )}>
              <Layers className={cn(
                "h-4 w-4",
                !selectedFonte ? "text-white dark:text-zinc-900" : "text-zinc-500"
              )} />
            </div>
            <span className={cn(
              "font-semibold text-sm",
              !selectedFonte ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-700 dark:text-zinc-300"
            )}>
              Todas Fontes
            </span>
          </div>
          <div className="flex justify-between text-left">
            <div>
              <p className="text-[10px] text-zinc-400 uppercase tracking-wide">Entradas</p>
              <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(fontes.reduce((sum, f) => sum + parseFloat(f.total_entradas), 0))}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-zinc-400 uppercase tracking-wide">Saídas</p>
              <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                {formatCurrency(fontes.reduce((sum, f) => sum + parseFloat(f.total_saidas), 0))}
              </p>
            </div>
          </div>
          <div className="mt-2 text-center">
            <p className="text-[10px] text-zinc-400">
              {fontes.reduce((sum, f) => sum + f.qtd_transacoes, 0)} transações
            </p>
          </div>
        </button>

        {/* Cards de fontes */}
        {fontes.map((fonte) => {
          const config = FONTE_CONFIG[fonte.fonte] || {
            label: fonte.fonte_label,
            icon: Wallet,
            bgLight: 'bg-zinc-100 dark:bg-zinc-800',
            textColor: 'text-zinc-600 dark:text-zinc-400',
            dot: 'bg-zinc-500',
          }
          const IconComponent = config.icon
          const isSelected = selectedFonte === fonte.fonte
          
          return (
            <button
              key={fonte.fonte}
              onClick={() => !isDragging && onSelect(fonte.fonte)}
              className={cn(
                "flex-shrink-0 w-64 p-4 rounded-xl border transition-all hover:shadow-md text-left select-none bg-white dark:bg-zinc-800",
                isSelected
                  ? "border-zinc-900 dark:border-zinc-100 ring-1 ring-zinc-900 dark:ring-zinc-100"
                  : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={cn("p-1.5 rounded-lg", config.bgLight)}>
                    <IconComponent className={cn("h-4 w-4", config.textColor)} />
                  </div>
                  <span className={cn(
                    "font-semibold text-sm truncate",
                    isSelected ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-700 dark:text-zinc-300"
                  )}>
                    {config.label}
                  </span>
                </div>
                {isSelected && (
                  <Check className="h-4 w-4 text-zinc-900 dark:text-zinc-100" />
                )}
              </div>
              <div className="flex justify-between">
                <div>
                  <p className="text-[10px] text-zinc-400 uppercase tracking-wide">Entradas</p>
                  <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(parseFloat(fonte.total_entradas))}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-zinc-400 uppercase tracking-wide">Saídas</p>
                  <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                    {formatCurrency(parseFloat(fonte.total_saidas))}
                  </p>
                </div>
              </div>
              <div className="mt-2 text-center">
                <p className="text-[10px] text-zinc-400">
                  {fonte.qtd_transacoes} transações
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================
// Componente de Visão de Calendário (Tailwind UI Style)
// ============================================================
function CalendarView({ transactions, onSelectDate, selectedDate, currentMonth, onMonthChange }) {
  const DAYS_OF_WEEK = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
  const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

  // Agrupa transações por dia
  const transactionsByDay = useMemo(() => {
    const grouped = {}
    transactions.forEach(t => {
      const day = t.data_transacao
      if (!grouped[day]) {
        grouped[day] = { entradas: 0, saidas: 0, count: 0, items: [] }
      }
      const valor = parseFloat(t.valor_absoluto) || 0
      if (t.is_entrada) {
        grouped[day].entradas += valor
      } else {
        grouped[day].saidas += valor
      }
      grouped[day].count++
      grouped[day].items.push(t)
    })
    return grouped
  }, [transactions])

  // Gera os dias do mês (incluindo dias do mês anterior/próximo para preencher o grid)
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    
    // Ajuste para começar na segunda-feira (0 = segunda, 6 = domingo)
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
      const date = `${prevYear}-${String(prevMonthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      days.push({ day, date, isCurrentMonth: false, data: transactionsByDay[date] })
    }
    
    // Dias do mês atual
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      days.push({ day, date, isCurrentMonth: true, data: transactionsByDay[date] })
    }
    
    // Dias do próximo mês para completar 6 semanas
    const remainingDays = 42 - days.length // 6 semanas * 7 dias
    for (let day = 1; day <= remainingDays; day++) {
      const nextYear = month === 11 ? year + 1 : year
      const nextMonthNum = month === 11 ? 1 : month + 2
      const date = `${nextYear}-${String(nextMonthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      days.push({ day, date, isCurrentMonth: false, data: transactionsByDay[date] })
    }
    
    return days
  }, [currentMonth, transactionsByDay])

  const goToPreviousMonth = () => {
    onMonthChange(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  }

  const goToNextMonth = () => {
    onMonthChange(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  }

  const goToToday = () => {
    onMonthChange(new Date())
  }

  const today = getTodayISO()

  // Formatar valor de forma compacta
  const formatCompact = (value) => {
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k`
    }
    return value.toFixed(0)
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      {/* Header do calendário */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={goToToday}
            className="text-xs"
          >
            Hoje
          </Button>
          <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={goToPreviousMonth}
              className="h-8 w-8 p-0 rounded-r-none border-r border-zinc-200 dark:border-zinc-700"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={goToNextMonth}
              className="h-8 w-8 p-0 rounded-l-none"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Dias da semana - Header fixo */}
      <div className="grid grid-cols-7 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
        {DAYS_OF_WEEK.map((day, idx) => (
          <div 
            key={day} 
            className={cn(
              "py-3 text-center text-xs font-semibold uppercase tracking-wider",
              idx < 6 ? "border-r border-zinc-200 dark:border-zinc-800" : "",
              "text-zinc-500 dark:text-zinc-400"
            )}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Grid do calendário */}
      <div className="grid grid-cols-7">
        {calendarDays.map((item, idx) => {
          const isToday = item.date === today
          const isSelected = item.date === selectedDate
          const hasTransactions = item.data && item.data.count > 0
          const rowIndex = Math.floor(idx / 7)
          const colIndex = idx % 7
          
          return (
            <button
              key={idx}
              onClick={() => item.date && onSelectDate(item.date === selectedDate ? null : item.date)}
              className={cn(
                "relative min-h-[120px] p-2 text-left transition-colors focus:z-10 focus:outline-none",
                // Bordas
                colIndex < 6 && "border-r border-zinc-200 dark:border-zinc-800",
                rowIndex < 5 && "border-b border-zinc-200 dark:border-zinc-800",
                // Background
                !item.isCurrentMonth && "bg-zinc-50/50 dark:bg-zinc-900/50",
                item.isCurrentMonth && "bg-white dark:bg-zinc-900",
                isSelected && "bg-indigo-50 dark:bg-indigo-950/20",
                // Hover
                "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
              )}
            >
              {/* Número do dia */}
              <div className="flex items-start justify-between">
                <span className={cn(
                  "inline-flex items-center justify-center text-sm",
                  isToday && "h-7 w-7 rounded-full bg-indigo-600 text-white font-semibold",
                  !isToday && item.isCurrentMonth && "text-zinc-900 dark:text-zinc-100 font-medium",
                  !isToday && !item.isCurrentMonth && "text-zinc-400 dark:text-zinc-600"
                )}>
                  {item.day}
                </span>
                {hasTransactions && (
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                    {item.data.count}
                  </span>
                )}
              </div>
              
              {/* Transações do dia */}
              {hasTransactions && (
                <div className="mt-2 space-y-1">
                  {/* Mostrar até 3 transações */}
                  {item.data.items.slice(0, 3).map((t, tIdx) => (
                    <div 
                      key={t.transaction_id}
                      className={cn(
                        "flex items-center justify-between gap-1 px-2 py-1 rounded text-xs truncate",
                        t.is_entrada 
                          ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400" 
                          : "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400"
                      )}
                    >
                      <span className="truncate flex-1 font-medium">
                        {t.vendor_nome || t.descricao_original.substring(0, 15)}
                      </span>
                      <span className="font-semibold whitespace-nowrap">
                        {t.is_entrada ? '+' : '-'}R${formatCompact(parseFloat(t.valor_absoluto))}
                      </span>
                    </div>
                  ))}
                  {/* Se há mais transações */}
                  {item.data.count > 3 && (
                    <div className="text-[10px] text-zinc-500 dark:text-zinc-400 px-2">
                      +{item.data.count - 3} mais
                    </div>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Drawer com transações do dia selecionado */}
      {selectedDate && transactionsByDay[selectedDate] && (
        <>
          {/* Overlay */}
          <div 
            className="fixed inset-0 bg-black/50 z-40 transition-opacity"
            onClick={() => onSelectDate(null)}
          />
          
          {/* Drawer */}
          <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white dark:bg-zinc-900 shadow-2xl z-50 overflow-hidden animate-in slide-in-from-right flex flex-col">
            {/* Header do drawer */}
            <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    {formatDateLong(selectedDate)}
                  </h2>
                  <p className="text-sm text-zinc-500 mt-0.5">
                    {transactionsByDay[selectedDate].count} transações
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => onSelectDate(null)} className="h-8 w-8 p-0">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Resumo do dia */}
            <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white dark:bg-zinc-800 rounded-lg p-3 border border-zinc-200 dark:border-zinc-700">
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowDownLeft className="h-4 w-4 text-emerald-500" />
                    <span className="text-xs text-zinc-500 font-medium">Entradas</span>
                  </div>
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    +{formatCurrency(transactionsByDay[selectedDate].entradas)}
                  </p>
                </div>
                <div className="bg-white dark:bg-zinc-800 rounded-lg p-3 border border-zinc-200 dark:border-zinc-700">
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowUpRight className="h-4 w-4 text-rose-500" />
                    <span className="text-xs text-zinc-500 font-medium">Saídas</span>
                  </div>
                  <p className="text-lg font-bold text-rose-600 dark:text-rose-400">
                    -{formatCurrency(transactionsByDay[selectedDate].saidas)}
                  </p>
                </div>
              </div>
            </div>
            
            {/* Lista de transações */}
            <div className="flex-1 overflow-auto px-6 py-4">
              <div className="space-y-3">
                {transactionsByDay[selectedDate].items.map((t) => (
                  <div 
                    key={t.transaction_id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 hover:border-zinc-200 dark:hover:border-zinc-700 transition-colors"
                  >
                    <VendorAvatar transacao={t} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate text-zinc-900 dark:text-zinc-100">
                        {t.vendor_nome || t.descricao_original}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className={cn("text-[10px] px-1.5 py-0.5", getCategoryColor(t.categoria_nome).bg, getCategoryColor(t.categoria_nome).text)}>
                          {t.categoria_nome}
                        </Badge>
                        <span className="text-xs text-zinc-400">
                          {t.fonte === 'conta_corrente' ? 'Conta Corrente' : 'Cartão de Crédito'}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={cn(
                        "font-bold text-base",
                        t.is_entrada ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-900 dark:text-zinc-100"
                      )}>
                        {t.is_entrada ? '+' : '-'}{formatCurrency(t.valor_absoluto)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================
// Componentes de UI
// ============================================================

// Componente de filtro em pill/tab
function FilterPill({ active, onClick, children, count, variant = 'default' }) {
  const variants = {
    default: active 
      ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' 
      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700',
    success: active
      ? 'bg-emerald-500 text-white'
      : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-400',
    danger: active
      ? 'bg-rose-500 text-white'
      : 'bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-400',
  }
  
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
        variants[variant]
      )}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span className={cn(
          "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-semibold",
          active 
            ? "bg-white/20 text-inherit" 
            : "bg-zinc-900/10 dark:bg-white/10"
        )}>
          {count}
        </span>
      )}
    </button>
  )
}

// Componente de select estilizado
function FilterSelect({ value, onChange, options, placeholder, icon: Icon }) {
  return (
    <div className="relative">
      {Icon && (
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800",
          "text-sm font-medium text-zinc-700 dark:text-zinc-300",
          "focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10",
          "cursor-pointer appearance-none pr-8",
          Icon ? "pl-10" : "pl-4"
        )}
      >
        <option value="">{placeholder}</option>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
    </div>
  )
}

// Header de coluna com ordenação
function SortableHeader({ children, sortKey, currentSort, onSort, className }) {
  const isActive = currentSort.key === sortKey
  const direction = isActive ? currentSort.direction : null
  
  return (
    <TableHead 
      className={cn(
        "text-xs font-semibold text-zinc-500 uppercase tracking-wider cursor-pointer select-none hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-colors",
        className
      )}
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-1">
        {children}
        <span className="ml-1">
          {!isActive && <ArrowUpDown className="h-3 w-3 opacity-40" />}
          {isActive && direction === 'asc' && <ArrowUp className="h-3 w-3" />}
          {isActive && direction === 'desc' && <ArrowDown className="h-3 w-3" />}
        </span>
      </div>
    </TableHead>
  )
}

// Card de resumo
function SummaryCard({ title, value, icon: Icon, trend, trendValue, variant = 'default' }) {
  const variants = {
    default: 'border-zinc-200 dark:border-zinc-700',
    success: 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20',
    danger: 'border-rose-200 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/20',
    info: 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20',
  }
  
  const iconVariants = {
    default: 'text-zinc-500',
    success: 'text-emerald-500',
    danger: 'text-rose-500',
    info: 'text-blue-500',
  }
  
  return (
    <Card className={cn("border", variants[variant])}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{title}</p>
            <p className={cn(
              "text-2xl font-bold mt-1",
              variant === 'success' && "text-emerald-600 dark:text-emerald-400",
              variant === 'danger' && "text-rose-600 dark:text-rose-400",
              variant === 'info' && "text-blue-600 dark:text-blue-400",
              variant === 'default' && "text-zinc-900 dark:text-zinc-100"
            )}>
              {value}
            </p>
            {trend && (
              <p className={cn(
                "text-xs mt-1 flex items-center gap-1",
                trend === 'up' ? "text-emerald-600" : "text-rose-600"
              )}>
                {trend === 'up' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {trendValue}
              </p>
            )}
          </div>
          <div className={cn(
            "h-12 w-12 rounded-xl flex items-center justify-center",
            variant === 'success' && "bg-emerald-100 dark:bg-emerald-900/30",
            variant === 'danger' && "bg-rose-100 dark:bg-rose-900/30",
            variant === 'info' && "bg-blue-100 dark:bg-blue-900/30",
            variant === 'default' && "bg-zinc-100 dark:bg-zinc-800"
          )}>
            <Icon className={cn("h-6 w-6", iconVariants[variant])} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Drawer de detalhes da transação
function TransactionDrawer({ transaction, onClose }) {
  if (!transaction) return null
  
  const categoryColor = getCategoryColor(transaction.categoria_nome)
  
  return (
    <>
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white dark:bg-zinc-900 shadow-2xl z-50 overflow-auto animate-in slide-in-from-right">
        <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Detalhes da Transação</h2>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="p-6 space-y-6">
          {/* Valor principal com Vendor */}
          <div className="text-center py-6 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
            {/* Avatar do Vendor ou ícone de tipo */}
            <div className="flex justify-center mb-4">
              <VendorAvatar transacao={transaction} size="lg" />
            </div>
            
            {/* Nome do vendor se existir */}
            {transaction.vendor_nome && (
              <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2">
                {transaction.vendor_nome}
              </p>
            )}
            
            <p className={cn(
              "text-3xl font-bold",
              transaction.is_entrada 
                ? "text-emerald-600 dark:text-emerald-400" 
                : "text-zinc-900 dark:text-zinc-100"
            )}>
              {transaction.is_entrada ? '+' : '-'} {formatCurrency(transaction.valor_absoluto)}
            </p>
            <p className="text-sm text-zinc-500 mt-2">
              {transaction.is_entrada ? 'Entrada' : 'Saída'}
            </p>
          </div>
          
          {/* Detalhes */}
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <FileText className="h-5 w-5 text-zinc-400 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-zinc-500 uppercase">Descrição</p>
                <p className="font-medium text-zinc-900 dark:text-zinc-100 mt-1">
                  {transaction.descricao_original}
                </p>
              </div>
            </div>
            
            {transaction.beneficiario && (
              <div className="flex items-start gap-3">
                <Eye className="h-5 w-5 text-zinc-400 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-zinc-500 uppercase">Beneficiário</p>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100 mt-1">
                    {transaction.beneficiario}
                  </p>
                </div>
              </div>
            )}
            
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-zinc-400 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-zinc-500 uppercase">Data</p>
                <p className="font-medium text-zinc-900 dark:text-zinc-100 mt-1">
                  {formatDate(transaction.data_transacao)}
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              {transaction.fonte === 'conta_corrente' ? (
                <Wallet className="h-5 w-5 text-zinc-400 mt-0.5" />
              ) : (
                <CreditCard className="h-5 w-5 text-zinc-400 mt-0.5" />
              )}
              <div>
                <p className="text-xs font-medium text-zinc-500 uppercase">Fonte</p>
                <p className="font-medium text-zinc-900 dark:text-zinc-100 mt-1">
                  {transaction.fonte === 'conta_corrente' ? 'Conta Corrente' : 'Cartão de Crédito'}
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className={cn("h-5 w-5 rounded-full mt-0.5", categoryColor.dot)} />
              <div>
                <p className="text-xs font-medium text-zinc-500 uppercase">Categoria</p>
                <Badge className={cn("mt-1", categoryColor.bg, categoryColor.text)}>
                  {transaction.categoria_nome}
                </Badge>
              </div>
            </div>
          </div>
          
          {/* Valor alto warning */}
          {parseFloat(transaction.valor_absoluto) >= HIGH_VALUE_THRESHOLD && (
            <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Transação de alto valor</p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                  Acima de {formatCurrency(HIGH_VALUE_THRESHOLD)}
                </p>
              </div>
            </div>
          )}
          
          {/* ID da transação */}
          <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
            <p className="text-xs text-zinc-400 font-mono">
              ID: {transaction.transaction_id}
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

// Checkbox customizado
function Checkbox({ checked, indeterminate, onChange, className }) {
  return (
    <button
      onClick={onChange}
      className={cn(
        "h-5 w-5 rounded border-2 flex items-center justify-center transition-colors",
        checked || indeterminate
          ? "bg-indigo-500 border-indigo-500 text-white"
          : "border-zinc-300 dark:border-zinc-600 hover:border-indigo-400",
        className
      )}
    >
      {checked && <Check className="h-3 w-3" />}
      {indeterminate && !checked && <Minus className="h-3 w-3" />}
    </button>
  )
}

// ============================================================
// Componente Principal
// ============================================================

export default function Transacoes() {
  const [transacoes, setTransacoes] = useState({ items: [], total: 0, page: 1, page_size: 20, total_pages: 0 })
  const [categorias, setCategorias] = useState([])
  const [categoriasStats, setCategoriasStats] = useState([])
  const [fontesStats, setFontesStats] = useState([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [showCategoryCarousel, setShowCategoryCarousel] = useState(false)
  const [showDatasourceCarousel, setShowDatasourceCarousel] = useState(false)
  const [viewMode, setViewMode] = useState('table') // 'table' ou 'calendar'
  const [calendarMonth, setCalendarMonth] = useState(new Date())
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(null)
  const [calendarTransacoes, setCalendarTransacoes] = useState([])
  const [calendarLoading, setCalendarLoading] = useState(false)
  
  // Filtros
  const [filtros, setFiltros] = useState({
    page: 1,
    page_size: 20,
    categoria: '',
    fonte: '',
    data_inicio: '',
    data_fim: '',
    tipo: '',
    busca: '',
    valor_min: '',
    valor_max: '',
    ordenar_por: 'data_transacao',
    ordem: 'desc',
  })
  
  // Dias com transações para o DateRangePicker
  const [transactionDays, setTransactionDays] = useState([])
  
  const [buscaTemp, setBuscaTemp] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())

  // Ordenação
  const [sort, setSort] = useState({ key: 'data_transacao', direction: 'desc' })

  // Carregar categorias disponíveis (apenas uma vez)
  useEffect(() => {
    async function fetchMetadata() {
      try {
        const categoriasData = await api.getTransacoesCategorias()
        setCategorias(categoriasData)
      } catch (error) {
        console.error('Erro ao carregar metadados:', error)
      }
    }
    fetchMetadata()
  }, [])

  // Carregar dias com transações para o DateRangePicker (recarrega quando filtros mudam)
  useEffect(() => {
    async function fetchTransactionDays() {
      try {
        const data = await api.getTransacoesDias({
          categoria: filtros.categoria || undefined,
          fonte: filtros.fonte || undefined,
        })
        setTransactionDays(data)
      } catch (error) {
        console.error('Erro ao carregar dias com transações:', error)
      }
    }
    fetchTransactionDays()
  }, [filtros.categoria, filtros.fonte])

  // Recarregar stats de categorias quando fonte ou período mudar
  useEffect(() => {
    async function fetchCategoriasStats() {
      try {
        const data = await api.getTransacoesCategoriasStats({
          fonte: filtros.fonte || undefined,
        })
        setCategoriasStats(data)
      } catch (error) {
        console.error('Erro ao carregar stats de categorias:', error)
      }
    }
    fetchCategoriasStats()
  }, [filtros.fonte])

  // Recarregar stats de fontes quando categoria mudar
  useEffect(() => {
    async function fetchFontesStats() {
      try {
        const data = await api.getTransacoesFontesStats({
          categoria: filtros.categoria || undefined,
        })
        setFontesStats(data)
      } catch (error) {
        console.error('Erro ao carregar stats de fontes:', error)
      }
    }
    fetchFontesStats()
  }, [filtros.categoria])

  // Carregar transações
  const fetchTransacoes = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.getTransacoes({
        ...filtros,
        ordenar_por: sort.key,
        ordem: sort.direction,
      })
      setTransacoes(data)
    } catch (error) {
      console.error('Erro ao carregar transações:', error)
    } finally {
      setLoading(false)
    }
  }, [filtros, sort])

  useEffect(() => {
    fetchTransacoes()
  }, [fetchTransacoes])

  // Carregar transações do calendário quando o mês mudar ou quando entrar no modo calendário
  const fetchCalendarTransacoes = useCallback(async (monthToFetch, currentFiltros) => {
    setCalendarLoading(true)
    try {
      const year = monthToFetch.getFullYear()
      const month = String(monthToFetch.getMonth() + 1).padStart(2, '0')
      const anoMes = `${year}-${month}`
      const data = await api.getTransacoes({
        ano_mes: anoMes,
        categoria: currentFiltros.categoria || undefined,
        fonte: currentFiltros.fonte || undefined,
        tipo: currentFiltros.tipo || undefined,
        busca: currentFiltros.busca || undefined,
        valor_min: currentFiltros.valor_min || undefined,
        valor_max: currentFiltros.valor_max || undefined,
        page: 1,
        page_size: 100, // Máximo permitido pelo backend
        ordenar_por: 'data_transacao',
        ordem: 'desc',
      })
      setCalendarTransacoes(data)
    } catch (error) {
      console.error('Erro ao carregar transações do calendário:', error)
    } finally {
      setCalendarLoading(false)
    }
  }, [])

  // Carregar quando entrar no modo calendário, mudar de mês ou aplicar filtros
  useEffect(() => {
    if (viewMode === 'calendar') {
      fetchCalendarTransacoes(calendarMonth, filtros)
    }
  }, [viewMode, calendarMonth, filtros.categoria, filtros.fonte, filtros.tipo, filtros.busca, filtros.valor_min, filtros.valor_max, fetchCalendarTransacoes])

  // Handlers
  const handleFiltroChange = (key, value) => {
    setFiltros(prev => ({ ...prev, [key]: value, page: 1 }))
    setSelectedIds(new Set())
  }

  const handleBusca = (e) => {
    e.preventDefault()
    setFiltros(prev => ({ ...prev, busca: buscaTemp, page: 1 }))
  }

  const handleLimparFiltros = () => {
    setFiltros({
      page: 1,
      page_size: 20,
      categoria: '',
      fonte: '',
      data_inicio: '',
      data_fim: '',
      tipo: '',
      busca: '',
      valor_min: '',
      valor_max: '',
      ordenar_por: 'data_transacao',
      ordem: 'desc',
    })
    setBuscaTemp('')
    setSelectedIds(new Set())
  }

  const handlePageChange = (newPage) => {
    setFiltros(prev => ({ ...prev, page: newPage }))
  }

  const handleSort = (key) => {
    setSort(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }))
  }

  const handleSelectAll = () => {
    if (selectedIds.size === transacoes.items.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(transacoes.items.map(t => t.transaction_id)))
    }
  }

  const handleSelectOne = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleExportar = async (onlySelected = false) => {
    setExporting(true)
    try {
      let data = await api.exportarTransacoes(filtros)
      
      if (onlySelected && selectedIds.size > 0) {
        data = data.filter(t => selectedIds.has(t.transaction_id))
      }
      
      // Criar CSV
      const headers = ['Data', 'Descrição', 'Categoria', 'Valor', 'Tipo', 'Fonte', 'Beneficiário']
      const rows = data.map(t => [
        t.data,
        `"${t.descricao.replace(/"/g, '""')}"`,
        t.categoria,
        t.valor.toFixed(2),
        t.tipo,
        t.fonte,
        `"${(t.beneficiario || '').replace(/"/g, '""')}"`
      ])
      
      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
      
      // Download
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `transacoes_${new Date().toISOString().split('T')[0]}.csv`
      link.click()
    } catch (error) {
      console.error('Erro ao exportar:', error)
    } finally {
      setExporting(false)
    }
  }

  // Cálculo de resumos
  const resumo = useMemo(() => {
    const items = transacoes.items || []
    const entradas = items
      .filter(t => t.is_entrada)
      .reduce((sum, t) => sum + (parseFloat(t.valor_absoluto) || 0), 0)
    const saidas = items
      .filter(t => !t.is_entrada)
      .reduce((sum, t) => sum + (parseFloat(t.valor_absoluto) || 0), 0)
    const saldo = entradas - saidas
    const qtdEntradas = items.filter(t => t.is_entrada).length
    const qtdSaidas = items.filter(t => !t.is_entrada).length
    
    return { entradas, saidas, saldo, qtdEntradas, qtdSaidas, total: items.length }
  }, [transacoes.items])

  const filtrosAtivos = Object.entries(filtros).filter(
    ([k, v]) => v && !['page', 'page_size', 'ordenar_por', 'ordem'].includes(k)
  ).length

  // Opções formatadas
  const categoriasOptions = useMemo(() => 
    categorias.map(c => ({ value: c.id, label: c.nome })), 
    [categorias]
  )

  // Agrupar transações por data
  const transacoesAgrupadas = useMemo(() => {
    const groups = {}
    const today = getTodayISO()
    const yesterday = getYesterdayISO()
    
    transacoes.items.forEach(t => {
      const date = t.data_transacao
      let label = date
      
      if (date === today) label = 'Hoje'
      else if (date === yesterday) label = 'Ontem'
      else {
        label = formatDateLong(date)
      }
      
      if (!groups[date]) {
        groups[date] = { label, date, items: [] }
      }
      groups[date].items.push(t)
    })
    
    return Object.values(groups)
  }, [transacoes.items])

  const isAllSelected = transacoes.items.length > 0 && selectedIds.size === transacoes.items.length
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < transacoes.items.length

  return (
    <div className="p-8 space-y-6 h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <LayoutList className="h-8 w-8 text-indigo-500" />
            Transações
          </h1>
          <p className="text-muted-foreground mt-1">
            Visualize e filtre todas as suas movimentações financeiras
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <Button 
              onClick={() => handleExportar(true)} 
              disabled={exporting} 
              variant="outline" 
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Exportar {selectedIds.size} selecionadas
            </Button>
          )}
          <Button onClick={() => handleExportar(false)} disabled={exporting} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            {exporting ? 'Exportando...' : 'Exportar Todas'}
          </Button>
        </div>
      </div>

      {/* Barra de filtros principal */}
      <div className="flex flex-col gap-4">
        {/* Linha 1: Filtros rápidos em pills + período + busca */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Filtros de tipo em pills */}
          <div className="flex items-center gap-2 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-full">
            <FilterPill 
              active={filtros.tipo === ''} 
              onClick={() => handleFiltroChange('tipo', '')}
              count={transacoes.total}
            >
              Todas
            </FilterPill>
            <FilterPill 
              active={filtros.tipo === 'entrada'} 
              onClick={() => handleFiltroChange('tipo', 'entrada')}
              variant="success"
            >
              <ArrowDownLeft className="h-4 w-4" />
              Entradas
            </FilterPill>
            <FilterPill 
              active={filtros.tipo === 'saida'} 
              onClick={() => handleFiltroChange('tipo', 'saida')}
              variant="danger"
            >
              <ArrowUpRight className="h-4 w-4" />
              Saídas
            </FilterPill>
          </div>

          {/* Separador */}
          <div className="h-8 w-px bg-zinc-200 dark:bg-zinc-700 hidden sm:block" />

          {/* Date Range Picker */}
          <DateRangePicker
            startDate={filtros.data_inicio}
            endDate={filtros.data_fim}
            onChange={({ startDate, endDate }) => {
              setFiltros(prev => ({
                ...prev,
                data_inicio: startDate || '',
                data_fim: endDate || '',
                page: 1,
              }))
            }}
            transactionDays={transactionDays}
            placeholder="Selecione um período"
          />

          {/* Fontes - Botão que abre carrossel */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDatasourceCarousel(!showDatasourceCarousel)}
            className={cn(
              "gap-2",
              showDatasourceCarousel && "bg-zinc-100 dark:bg-zinc-800 border-zinc-400 dark:border-zinc-500",
              filtros.fonte && !showDatasourceCarousel && "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100"
            )}
          >
            <Wallet className="h-4 w-4" />
            {filtros.fonte 
              ? (filtros.fonte === 'conta_corrente' ? 'Conta Corrente' : 'Cartão de Crédito')
              : 'Fontes'
            }
            {filtros.fonte && (
              <span className="bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 px-1.5 py-0.5 rounded text-xs">
                1
              </span>
            )}
            <ChevronDown className={cn(
              "h-4 w-4 transition-transform",
              showDatasourceCarousel && "rotate-180"
            )} />
          </Button>

          {/* Separador */}
          <div className="h-8 w-px bg-zinc-200 dark:bg-zinc-700 hidden lg:block" />

          {/* Categoria - Botão que abre carrossel */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCategoryCarousel(!showCategoryCarousel)}
            className={cn(
              "gap-2",
              showCategoryCarousel && "bg-zinc-100 dark:bg-zinc-800 border-zinc-400 dark:border-zinc-500",
              filtros.categoria && !showCategoryCarousel && "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100"
            )}
          >
            <Tag className="h-4 w-4" />
            {filtros.categoria 
              ? categorias.find(c => c.id === filtros.categoria)?.nome || 'Categoria'
              : 'Categorias'
            }
            {filtros.categoria && (
              <span className="bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 px-1.5 py-0.5 rounded text-xs">
                1
              </span>
            )}
            <ChevronDown className={cn(
              "h-4 w-4 transition-transform",
              showCategoryCarousel && "rotate-180"
            )} />
          </Button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Toggle Table/Calendar */}
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
            <button
              onClick={() => setViewMode('table')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                viewMode === 'table'
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              )}
            >
              <Table2 className="h-4 w-4" />
              Tabela
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                viewMode === 'calendar'
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              )}
            >
              <CalendarDays className="h-4 w-4" />
              Calendário
            </button>
          </div>
        </div>

        {/* Carrossel de datasources (fontes) */}
        {showDatasourceCarousel && fontesStats.length > 0 && (
          <DatasourceCarousel
            fontes={fontesStats}
            selectedFonte={filtros.fonte}
            onSelect={(fonte) => {
              handleFiltroChange('fonte', fonte)
            }}
          />
        )}

        {/* Carrossel de categorias */}
        {showCategoryCarousel && categoriasStats.length > 0 && (
          <CategoryCarousel
            categories={categoriasStats}
            selectedCategory={filtros.categoria}
            onSelect={(catId) => {
              handleFiltroChange('categoria', catId)
            }}
          />
        )}

        {/* Linha de controles: filtros avançados, tags, contador */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="gap-2 text-zinc-600 dark:text-zinc-400"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtros avançados
            <ChevronDown className={cn(
              "h-4 w-4 transition-transform",
              showAdvanced && "rotate-180"
            )} />
          </Button>

          {/* Tags de filtros ativos */}
          {filtrosAtivos > 0 && (
            <>
              <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-700" />
              <div className="flex items-center gap-2 flex-wrap">
                {filtros.categoria && (
                  <Badge variant="secondary" className="gap-1 pr-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
                    <Tag className="h-3 w-3" />
                    {categorias.find(c => c.id === filtros.categoria)?.nome || filtros.categoria}
                    <button 
                      onClick={() => handleFiltroChange('categoria', '')}
                      className="ml-1 hover:bg-indigo-200 dark:hover:bg-indigo-800 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {filtros.fonte && (
                  <Badge variant="secondary" className="gap-1 pr-1 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300">
                    {filtros.fonte === 'conta_corrente' ? (
                      <Wallet className="h-3 w-3" />
                    ) : (
                      <CreditCard className="h-3 w-3" />
                    )}
                    {filtros.fonte === 'conta_corrente' ? 'Conta Corrente' : 'Cartão de Crédito'}
                    <button 
                      onClick={() => handleFiltroChange('fonte', '')}
                      className="ml-1 hover:bg-violet-200 dark:hover:bg-violet-800 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {(filtros.data_inicio || filtros.data_fim) && (
                  <Badge variant="secondary" className="gap-1 pr-1 bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
                    <Calendar className="h-3 w-3" />
                    {filtros.data_inicio && filtros.data_fim 
                      ? `${formatDate(filtros.data_inicio)} - ${formatDate(filtros.data_fim)}`
                      : filtros.data_inicio 
                        ? formatDate(filtros.data_inicio)
                        : formatDate(filtros.data_fim)
                    }
                    <button 
                      onClick={() => setFiltros(f => ({ ...f, data_inicio: '', data_fim: '' }))}
                      className="ml-1 hover:bg-zinc-200 dark:hover:bg-zinc-600 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {filtros.busca && (
                  <Badge variant="secondary" className="gap-1 pr-1">
                    Busca: "{filtros.busca}"
                    <button 
                      onClick={() => { setFiltros(f => ({ ...f, busca: '' })); setBuscaTemp('') }}
                      className="ml-1 hover:bg-zinc-300 dark:hover:bg-zinc-600 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {filtros.valor_min && (
                  <Badge variant="secondary" className="gap-1 pr-1">
                    Min: R$ {filtros.valor_min}
                    <button 
                      onClick={() => handleFiltroChange('valor_min', '')}
                      className="ml-1 hover:bg-zinc-300 dark:hover:bg-zinc-600 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {filtros.valor_max && (
                  <Badge variant="secondary" className="gap-1 pr-1">
                    Max: R$ {filtros.valor_max}
                    <button 
                      onClick={() => handleFiltroChange('valor_max', '')}
                      className="ml-1 hover:bg-zinc-300 dark:hover:bg-zinc-600 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleLimparFiltros}
                  className="h-6 px-2 text-xs text-zinc-500 hover:text-zinc-700"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Limpar
                </Button>
              </div>
            </>
          )}

          {/* Contador de seleção */}
          {selectedIds.size > 0 && (
            <>
              <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-700" />
              <Badge variant="default" className="bg-indigo-500">
                <CheckSquare className="h-3 w-3 mr-1" />
                {selectedIds.size} selecionadas
              </Badge>
            </>
          )}

          {/* Contador de resultados */}
          <div className="ml-auto text-sm text-zinc-500">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              {transacoes.total.toLocaleString('pt-BR')}
            </span>
            {' '}transações
          </div>
        </div>

        {/* Filtros avançados expandidos */}
        {showAdvanced && (
          <Card className="border-dashed">
            <CardContent className="pt-4 pb-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 block">
                    Valor mínimo
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">R$</span>
                    <Input
                      type="number"
                      placeholder="0,00"
                      value={filtros.valor_min}
                      onChange={(e) => handleFiltroChange('valor_min', e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 block">
                    Valor máximo
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">R$</span>
                    <Input
                      type="number"
                      placeholder="0,00"
                      value={filtros.valor_max}
                      onChange={(e) => handleFiltroChange('valor_max', e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 block">
                    Itens por página
                  </label>
                  <select
                    value={filtros.page_size}
                    onChange={(e) => handleFiltroChange('page_size', Number(e.target.value))}
                    className="w-full h-10 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 text-sm"
                  >
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 block">
                    Valores altos ({'>'}R$ {HIGH_VALUE_THRESHOLD})
                  </label>
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => handleFiltroChange('valor_min', HIGH_VALUE_THRESHOLD.toString())}
                  >
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Mostrar apenas altos
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Visão de Calendário */}
      {viewMode === 'calendar' && (
        <div className="relative">
          {calendarLoading && (
            <div className="absolute inset-0 bg-white/60 dark:bg-zinc-900/60 z-10 flex items-center justify-center rounded-xl">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
            </div>
          )}
          <CalendarView
            transactions={calendarTransacoes.items || []}
            selectedDate={selectedCalendarDate}
            onSelectDate={setSelectedCalendarDate}
            currentMonth={calendarMonth}
            onMonthChange={setCalendarMonth}
          />
        </div>
      )}

      {/* Tabela de transações */}
      {viewMode === 'table' && (
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center gap-2">
                <div className="h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-muted-foreground">Carregando transações...</span>
              </div>
            </div>
          ) : transacoes.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <LayoutList className="h-12 w-12 text-zinc-300 dark:text-zinc-600 mb-3" />
              <p className="font-medium text-zinc-600 dark:text-zinc-400">Nenhuma transação encontrada</p>
              <p className="text-sm text-zinc-500 mt-1">Tente ajustar os filtros</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <TableHead className="w-[50px]">
                      <Checkbox 
                        checked={isAllSelected}
                        indeterminate={isSomeSelected}
                        onChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="w-[60px] text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      Tipo
                    </TableHead>
                    <SortableHeader 
                      sortKey="valor_absoluto" 
                      currentSort={sort} 
                      onSort={handleSort}
                      className="w-[140px]"
                    >
                      Valor
                    </SortableHeader>
                    <TableHead className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      Fonte
                    </TableHead>
                    <SortableHeader sortKey="descricao_original" currentSort={sort} onSort={handleSort}>
                      Descrição
                    </SortableHeader>
                    <SortableHeader sortKey="categoria_nome" currentSort={sort} onSort={handleSort}>
                      Categoria
                    </SortableHeader>
                    <SortableHeader sortKey="data_transacao" currentSort={sort} onSort={handleSort} className="text-right">
                      Data
                    </SortableHeader>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transacoesAgrupadas.map((group, groupIndex) => (
                    <Fragment key={group.date}>
                      {/* Separador de data */}
                      <TableRow className="bg-zinc-50/80 dark:bg-zinc-800/30 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30">
                        <TableCell colSpan={7} className="py-2">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-zinc-400" />
                            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                              {group.label}
                            </span>
                            <span className="text-xs text-zinc-400">
                              ({group.items.length} transações)
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                      
                      {group.items.map((transacao) => {
                        const categoryColor = getCategoryColor(transacao.categoria_nome)
                        const isHighValue = parseFloat(transacao.valor_absoluto) >= HIGH_VALUE_THRESHOLD
                        const isSelected = selectedIds.has(transacao.transaction_id)
                        
                        return (
                          <TableRow 
                            key={transacao.transaction_id}
                            className={cn(
                              "group cursor-pointer transition-colors",
                              isSelected 
                                ? "bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/30"
                                : "hover:bg-zinc-50 dark:hover:bg-zinc-800/30",
                              isHighValue && !isSelected && "bg-amber-50/50 dark:bg-amber-900/10"
                            )}
                            onClick={() => setSelectedTransaction(transacao)}
                          >
                            {/* Checkbox */}
                            <TableCell className="py-4" onClick={(e) => e.stopPropagation()}>
                              <Checkbox 
                                checked={isSelected}
                                onChange={() => handleSelectOne(transacao.transaction_id)}
                              />
                            </TableCell>
                            
                            {/* Vendor/Tipo com ícone */}
                            <TableCell className="py-4">
                              <VendorAvatar transacao={transacao} size="md" />
                            </TableCell>
                            
                            {/* Valor */}
                            <TableCell className="py-4">
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  "font-semibold tabular-nums",
                                  transacao.is_entrada 
                                    ? "text-emerald-600 dark:text-emerald-400" 
                                    : "text-zinc-900 dark:text-zinc-100"
                                )}>
                                  {transacao.is_entrada ? '+' : '-'} {formatCurrency(transacao.valor_absoluto)}
                                </span>
                                {isHighValue && (
                                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                                )}
                              </div>
                            </TableCell>
                            
                            {/* Fonte */}
                            <TableCell className="py-4">
                              <div className="flex items-center gap-2">
                                {transacao.fonte === 'conta_corrente' ? (
                                  <Wallet className="h-4 w-4 text-zinc-400" />
                                ) : (
                                  <CreditCard className="h-4 w-4 text-zinc-400" />
                                )}
                                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                                  {transacao.fonte === 'conta_corrente' ? 'Conta' : 'Cartão'}
                                </span>
                              </div>
                            </TableCell>
                            
                            {/* Descrição */}
                            <TableCell className="py-4">
                              <div className="max-w-[300px]">
                                <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                                  {transacao.descricao_original}
                                </p>
                                {transacao.beneficiario && (
                                  <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                                    {transacao.beneficiario}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            
                            {/* Categoria com cor */}
                            <TableCell className="py-4">
                              <Badge className={cn(categoryColor.bg, categoryColor.text, "font-medium")}>
                                <span className={cn("w-2 h-2 rounded-full mr-2", categoryColor.dot)} />
                                {transacao.categoria_nome}
                              </Badge>
                            </TableCell>
                            
                            {/* Data */}
                            <TableCell className="py-4 text-right">
                              <span className="text-sm text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                                {formatDate(transacao.data_transacao)}
                              </span>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>

              {/* Paginação melhorada */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30">
                <div className="text-sm text-zinc-500">
                  Mostrando{' '}
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {((transacoes.page - 1) * transacoes.page_size) + 1}
                  </span>
                  {' '}a{' '}
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {Math.min(transacoes.page * transacoes.page_size, transacoes.total)}
                  </span>
                  {' '}de{' '}
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {transacoes.total.toLocaleString('pt-BR')}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePageChange(1)}
                    disabled={transacoes.page <= 1}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <ChevronLeft className="h-4 w-4 -ml-2" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePageChange(transacoes.page - 1)}
                    disabled={transacoes.page <= 1}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  
                  {/* Números de página */}
                  <div className="flex items-center gap-1 mx-2">
                    {Array.from({ length: Math.min(5, transacoes.total_pages) }, (_, i) => {
                      let pageNum
                      if (transacoes.total_pages <= 5) {
                        pageNum = i + 1
                      } else if (transacoes.page <= 3) {
                        pageNum = i + 1
                      } else if (transacoes.page >= transacoes.total_pages - 2) {
                        pageNum = transacoes.total_pages - 4 + i
                      } else {
                        pageNum = transacoes.page - 2 + i
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={transacoes.page === pageNum ? "default" : "ghost"}
                          size="sm"
                          onClick={() => handlePageChange(pageNum)}
                          className={cn(
                            "h-8 w-8 p-0",
                            transacoes.page === pageNum && "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900"
                          )}
                        >
                          {pageNum}
                        </Button>
                      )
                    })}
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePageChange(transacoes.page + 1)}
                    disabled={transacoes.page >= transacoes.total_pages}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePageChange(transacoes.total_pages)}
                    disabled={transacoes.page >= transacoes.total_pages}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronRight className="h-4 w-4" />
                    <ChevronRight className="h-4 w-4 -ml-2" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      )}

      {/* Drawer de detalhes */}
      {selectedTransaction && (
        <TransactionDrawer 
          transaction={selectedTransaction} 
          onClose={() => setSelectedTransaction(null)} 
        />
      )}
    </div>
  )
}
