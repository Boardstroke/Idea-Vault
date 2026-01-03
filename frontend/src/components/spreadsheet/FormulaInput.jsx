import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Hash, Calendar, DollarSign, Percent, Clock, Calculator, Sigma, Database, Sparkles } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useSpreadsheetStore } from '../../hooks/useSpreadsheetStore'

/**
 * Variáveis especiais do sistema
 */
const SYSTEM_VARIABLES = [
  { 
    name: '$monthIndex', 
    description: 'Índice do mês atual (1-12)',
    icon: Calendar,
    category: 'system',
  },
  { 
    name: '$yearIndex', 
    description: 'Ano atual (ex: 2024)',
    icon: Calendar,
    category: 'system',
  },
  { 
    name: '$periodIndex', 
    description: 'Índice do período (0, 1, 2...)',
    icon: Clock,
    category: 'system',
  },
]

/**
 * Funções matemáticas disponíveis
 */
const MATH_FUNCTIONS = [
  {
    name: '$max',
    description: 'Retorna o maior valor - $max(a, b)',
    icon: Calculator,
    category: 'function',
    snippet: '$max(, )',
  },
  {
    name: '$min',
    description: 'Retorna o menor valor - $min(a, b)',
    icon: Calculator,
    category: 'function',
    snippet: '$min(, )',
  },
  {
    name: '$abs',
    description: 'Valor absoluto - $abs(x)',
    icon: Calculator,
    category: 'function',
    snippet: '$abs()',
  },
  {
    name: '$round',
    description: 'Arredonda para inteiro - $round(x)',
    icon: Calculator,
    category: 'function',
    snippet: '$round()',
  },
  {
    name: '$floor',
    description: 'Arredonda para baixo - $floor(x)',
    icon: Calculator,
    category: 'function',
    snippet: '$floor()',
  },
  {
    name: '$ceil',
    description: 'Arredonda para cima - $ceil(x)',
    icon: Calculator,
    category: 'function',
    snippet: '$ceil()',
  },
  {
    name: '$pow',
    description: 'Potência - $pow(base, exp)',
    icon: Calculator,
    category: 'function',
    snippet: '$pow(, )',
  },
  {
    name: '$sqrt',
    description: 'Raiz quadrada - $sqrt(x)',
    icon: Calculator,
    category: 'function',
    snippet: '$sqrt()',
  },
  {
    name: '$if',
    description: 'Condicional - $if(cond, then, else)',
    icon: Sparkles,
    category: 'function',
    snippet: '$if(, , )',
  },
  {
    name: '$sum',
    description: 'Soma de valores - $sum(a, b, c...)',
    icon: Sigma,
    category: 'function',
    snippet: '$sum(, )',
  },
  {
    name: '$avg',
    description: 'Média de valores - $avg(a, b, c...)',
    icon: Sigma,
    category: 'function',
    snippet: '$avg(, )',
  },
]

/**
 * Configuração das categorias
 */
const CATEGORY_CONFIG = {
  function: {
    label: 'Funções',
    icon: Calculator,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
  system: {
    label: 'Variáveis do Sistema',
    icon: Clock,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  input: {
    label: 'Inputs',
    icon: Database,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
  },
  calculation: {
    label: 'Calculations',
    icon: Sigma,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
  },
}

/**
 * FormulaInput - Campo de entrada de fórmula com autocomplete
 * 
 * Features:
 * - Autocomplete ao digitar $
 * - Sugestões organizadas por categoria
 * - Navegação com teclado e scroll automático
 */
export default function FormulaInput({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder = "Enter formula (e.g., $Revenue * 1.1)",
  autoFocus = true,
  className,
}) {
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [groupedSuggestions, setGroupedSuggestions] = useState({})
  const [flatSuggestions, setFlatSuggestions] = useState([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [cursorPosition, setCursorPosition] = useState(0)
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 })
  
  const inputRef = useRef(null)
  const menuRef = useRef(null)
  const itemRefs = useRef({})
  
  const { variables } = useSpreadsheetStore()
  
  // Atualiza posição do menu
  const updateMenuPosition = useCallback(() => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect()
      setMenuPosition({
        left: rect.left,
        top: rect.bottom + 4,
      })
    }
  }, [])
  
  // Gera sugestões baseadas no texto digitado
  const generateSuggestions = useCallback((text, cursor) => {
    const beforeCursor = text.slice(0, cursor)
    const dollarMatch = beforeCursor.match(/\$(\w*)$/)
    
    if (!dollarMatch) {
      setShowSuggestions(false)
      return
    }
    
    const searchTerm = dollarMatch[1].toLowerCase()
    
    // Cria variáveis do usuário separadas por grupo
    const inputVariables = variables
      .filter(v => v.group === 'inputs')
      .map(v => ({
        name: `$${v.name}`,
        description: 'Input variable',
        icon: v.type === 'currency' ? DollarSign : v.type === 'percentage' ? Percent : Hash,
        category: 'input',
        variableId: v.id,
      }))
    
    const calculationVariables = variables
      .filter(v => v.group === 'calculations')
      .map(v => ({
        name: `$${v.name}`,
        description: 'Calculation',
        icon: v.type === 'currency' ? DollarSign : v.type === 'percentage' ? Percent : Hash,
        category: 'calculation',
        variableId: v.id,
      }))
    
    // Filtra por termo de busca
    const filterFn = (s) => 
      searchTerm === '' || 
      s.name.toLowerCase().includes(searchTerm) ||
      s.description.toLowerCase().includes(searchTerm)
    
    const filteredFunctions = MATH_FUNCTIONS.filter(filterFn)
    const filteredSystem = SYSTEM_VARIABLES.filter(filterFn)
    const filteredInputs = inputVariables.filter(filterFn)
    const filteredCalculations = calculationVariables.filter(filterFn)
    
    // Agrupa por categoria
    const grouped = {}
    if (filteredFunctions.length > 0) grouped.function = filteredFunctions
    if (filteredSystem.length > 0) grouped.system = filteredSystem
    if (filteredInputs.length > 0) grouped.input = filteredInputs
    if (filteredCalculations.length > 0) grouped.calculation = filteredCalculations
    
    // Lista plana para navegação
    const flat = [
      ...filteredFunctions,
      ...filteredSystem,
      ...filteredInputs,
      ...filteredCalculations,
    ]
    
    setGroupedSuggestions(grouped)
    setFlatSuggestions(flat)
    setSelectedIndex(0)
    setShowSuggestions(flat.length > 0)
    updateMenuPosition()
  }, [variables, updateMenuPosition])
  
  // Scroll para item selecionado
  useEffect(() => {
    if (showSuggestions && flatSuggestions[selectedIndex]) {
      const selectedItem = itemRefs.current[selectedIndex]
      if (selectedItem && menuRef.current) {
        selectedItem.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        })
      }
    }
  }, [selectedIndex, showSuggestions, flatSuggestions])
  
  // Insere sugestão selecionada
  const insertSuggestion = useCallback((suggestion) => {
    const beforeCursor = value.slice(0, cursorPosition)
    const afterCursor = value.slice(cursorPosition)
    
    const dollarIndex = beforeCursor.lastIndexOf('$')
    const insertText = suggestion.snippet || suggestion.name
    const newValue = beforeCursor.slice(0, dollarIndex) + insertText + afterCursor
    
    onChange(newValue)
    setShowSuggestions(false)
    
    setTimeout(() => {
      if (inputRef.current) {
        let newPosition
        if (suggestion.snippet) {
          newPosition = dollarIndex + insertText.indexOf('(') + 1
        } else {
          newPosition = dollarIndex + insertText.length
        }
        inputRef.current.setSelectionRange(newPosition, newPosition)
        inputRef.current.focus()
      }
    }, 0)
  }, [value, cursorPosition, onChange])
  
  // Handlers
  const handleChange = useCallback((e) => {
    const newValue = e.target.value
    onChange(newValue)
    
    setTimeout(() => {
      if (inputRef.current) {
        const cursor = inputRef.current.selectionStart
        setCursorPosition(cursor)
        generateSuggestions(newValue, cursor)
      }
    }, 0)
  }, [onChange, generateSuggestions])
  
  const handleKeyDown = useCallback((e) => {
    if (showSuggestions && flatSuggestions.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(i => Math.min(i + 1, flatSuggestions.length - 1))
          return
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(i => Math.max(i - 1, 0))
          return
        case 'Tab':
        case 'Enter':
          if (flatSuggestions[selectedIndex]) {
            e.preventDefault()
            insertSuggestion(flatSuggestions[selectedIndex])
            return
          }
          break
        case 'Escape':
          e.preventDefault()
          setShowSuggestions(false)
          return
      }
    }
    
    if (e.key === 'Enter' && !showSuggestions) {
      e.preventDefault()
      onSubmit?.()
    } else if (e.key === 'Escape' && !showSuggestions) {
      onCancel?.()
    }
  }, [showSuggestions, flatSuggestions, selectedIndex, insertSuggestion, onSubmit, onCancel])
  
  const handleClick = useCallback((e) => {
    setCursorPosition(e.target.selectionStart)
    generateSuggestions(value, e.target.selectionStart)
  }, [value, generateSuggestions])
  
  // Fecha menu ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e) => {
      const clickedInInput = inputRef.current?.contains(e.target)
      const clickedInMenu = menuRef.current?.contains(e.target)
      
      if (!clickedInInput && !clickedInMenu) {
        setShowSuggestions(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
  // Foca no input ao montar
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus()
    }
  }, [autoFocus])
  
  // Calcula índice global para cada item
  const getGlobalIndex = (category, localIndex) => {
    let globalIndex = 0
    const categoryOrder = ['function', 'system', 'input', 'calculation']
    
    for (const cat of categoryOrder) {
      if (cat === category) {
        return globalIndex + localIndex
      }
      if (groupedSuggestions[cat]) {
        globalIndex += groupedSuggestions[cat].length
      }
    }
    return globalIndex
  }
  
  return (
    <>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
        placeholder={placeholder}
        className={cn(
          "w-full h-full px-3 text-sm bg-transparent focus:outline-none",
          className
        )}
      />
      
      {/* Menu de sugestões via Portal */}
      {showSuggestions && flatSuggestions.length > 0 && createPortal(
        <div
          ref={menuRef}
          className="fixed bg-popover border rounded-lg shadow-lg overflow-hidden"
          style={{
            zIndex: 9999,
            width: '340px',
            maxHeight: '320px',
            left: menuPosition.left,
            top: menuPosition.top,
          }}
        >
          <div className="overflow-y-auto max-h-[320px]">
            {/* Renderiza cada categoria */}
            {['function', 'system', 'input', 'calculation'].map(categoryKey => {
              const items = groupedSuggestions[categoryKey]
              if (!items || items.length === 0) return null
              
              const config = CATEGORY_CONFIG[categoryKey]
              
              return (
                <div key={categoryKey} className="py-1">
                  {/* Header da categoria */}
                  <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground sticky top-0 bg-popover border-b">
                    <config.icon className={cn("w-3.5 h-3.5", config.color)} />
                    <span>{config.label}</span>
                    <span className="ml-auto text-muted-foreground/60">
                      {items.length}
                    </span>
                  </div>
                  
                  {/* Items da categoria */}
                  {items.map((suggestion, localIndex) => {
                    const globalIndex = getGlobalIndex(categoryKey, localIndex)
                    const isSelected = globalIndex === selectedIndex
                    
                    return (
                      <button
                        key={suggestion.name}
                        ref={el => itemRefs.current[globalIndex] = el}
                        onClick={() => insertSuggestion(suggestion)}
                        className={cn(
                          "flex items-center gap-3 w-full px-3 py-2 text-sm text-left transition-colors",
                          isSelected ? "bg-accent" : "hover:bg-accent/50"
                        )}
                      >
                        <span className={cn(
                          "flex items-center justify-center w-6 h-6 rounded text-xs",
                          config.bgColor,
                          config.color
                        )}>
                          <suggestion.icon className="w-3.5 h-3.5" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-sm">{suggestion.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {suggestion.description}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )
            })}
            
            {/* Dica de uso */}
            <div className="px-3 py-2 text-xs text-muted-foreground border-t bg-muted/30">
              <span className="font-medium">Tip:</span> Digite <code className="px-1 py-0.5 bg-muted rounded">$</code> para ver variáveis • <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">↑↓</kbd> navegar • <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Enter</kbd> selecionar
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
