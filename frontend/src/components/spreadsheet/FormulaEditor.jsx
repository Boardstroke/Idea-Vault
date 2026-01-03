import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { X, CornerDownLeft } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useSpreadsheetStore } from '../../hooks/useSpreadsheetStore'
import { tokenize, getAutocompleteSuggestions, tokensToString, TokenType } from '../../lib/formulaParser'
import FormulaChip, { FormulaDisplay } from './FormulaChip'

/**
 * FormulaEditor - Editor de fórmulas estilo Causal
 * 
 * Features:
 * - Input com autocomplete de variáveis
 * - Chips coloridos para variáveis
 * - Dropdown de time shifting
 * - Preview da fórmula
 */
export default function FormulaEditor({ variableId, onClose }) {
  const {
    variables,
    getVariable,
    setFormula,
    stopEditingFormula,
  } = useSpreadsheetStore()
  
  const variable = getVariable(variableId)
  const [inputValue, setInputValue] = useState('')
  const [tokens, setTokens] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [selectedSuggestion, setSelectedSuggestion] = useState(0)
  const [cursorPosition, setCursorPosition] = useState(0)
  
  const inputRef = useRef(null)
  const containerRef = useRef(null)
  
  // Outras variáveis disponíveis (exceto a atual)
  const availableVariables = useMemo(() => 
    variables.filter(v => v.id !== variableId),
    [variables, variableId]
  )
  
  // Inicializa com fórmula existente
  useEffect(() => {
    if (variable?.formula) {
      setInputValue(variable.formula.raw)
      setTokens(tokenize(variable.formula.raw, availableVariables))
    }
  }, [variable, availableVariables])
  
  // Foca no input
  useEffect(() => {
    inputRef.current?.focus()
  }, [])
  
  // Fecha ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        handleClose()
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
  // Atualiza tokens e sugestões quando input muda
  useEffect(() => {
    const newTokens = tokenize(inputValue, availableVariables)
    setTokens(newTokens)
    
    // Encontra palavra parcial para autocomplete
    const words = inputValue.split(/[\s+\-*/()]+/)
    const lastWord = words[words.length - 1] || ''
    
    if (lastWord.length > 0) {
      const newSuggestions = getAutocompleteSuggestions(lastWord, availableVariables)
      setSuggestions(newSuggestions)
      setSelectedSuggestion(0)
    } else {
      setSuggestions([])
    }
  }, [inputValue, availableVariables])
  
  const handleInputChange = (e) => {
    setInputValue(e.target.value)
    setCursorPosition(e.target.selectionStart)
  }
  
  const handleKeyDown = (e) => {
    // Navegação nas sugestões
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedSuggestion(s => Math.min(s + 1, suggestions.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedSuggestion(s => Math.max(s - 1, 0))
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && suggestions.length > 0)) {
        e.preventDefault()
        insertSuggestion(suggestions[selectedSuggestion])
        return
      }
    }
    
    if (e.key === 'Enter' && suggestions.length === 0) {
      e.preventDefault()
      handleSave()
    }
    
    if (e.key === 'Escape') {
      handleClose()
    }
  }
  
  const insertSuggestion = (variable) => {
    // Encontra a última palavra parcial e substitui pela variável
    const words = inputValue.split(/(\s+|[+\-*/()]+)/)
    const lastWordIndex = words.length - 1
    
    // Encontra onde a última palavra começa
    let lastWordStart = 0
    for (let i = 0; i < lastWordIndex; i++) {
      lastWordStart += words[i].length
    }
    
    const newValue = inputValue.slice(0, lastWordStart) + variable.name + ' '
    setInputValue(newValue)
    setSuggestions([])
    
    // Move cursor para o final
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.selectionStart = newValue.length
        inputRef.current.selectionEnd = newValue.length
      }
    }, 0)
  }
  
  const handleTokenChange = (idx, newToken) => {
    if (newToken === null) {
      // Remove token
      const newTokens = [...tokens]
      newTokens.splice(idx, 1)
      setTokens(newTokens)
      setInputValue(tokensToString(newTokens))
    } else {
      // Atualiza token
      const newTokens = [...tokens]
      newTokens[idx] = newToken
      setTokens(newTokens)
      setInputValue(tokensToString(newTokens))
    }
  }
  
  const handleSave = () => {
    if (inputValue.trim()) {
      setFormula(variableId, inputValue.trim())
    }
    handleClose()
  }
  
  const handleClear = () => {
    setFormula(variableId, null)
    handleClose()
  }
  
  const handleClose = () => {
    stopEditingFormula()
    onClose?.()
  }
  
  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/50"
    >
      <div className="w-full max-w-2xl bg-background rounded-lg shadow-2xl border overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="text-primary font-mono">ƒ</span>
            <span className="font-medium">{variable?.name}</span>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        {/* Preview da fórmula com chips */}
        {tokens.length > 0 && (
          <div className="px-4 py-3 border-b bg-muted/10">
            <div className="text-xs text-muted-foreground mb-1">Preview</div>
            <FormulaDisplay 
              tokens={tokens} 
              variables={availableVariables}
              onTokenChange={handleTokenChange}
            />
          </div>
        )}
        
        {/* Input de fórmula */}
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Enter formula (e.g., Revenue * Growth rate)"
            className="w-full px-4 py-4 text-lg bg-transparent focus:outline-none"
          />
          
          {/* Sugestões de autocomplete */}
          {suggestions.length > 0 && (
            <div className="absolute left-4 right-4 top-full z-10 bg-popover border rounded-lg shadow-lg overflow-hidden">
              {suggestions.map((variable, idx) => (
                <button
                  key={variable.id}
                  onClick={() => insertSuggestion(variable)}
                  className={cn(
                    "flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-accent transition-colors",
                    idx === selectedSuggestion && "bg-accent"
                  )}
                >
                  <span className="font-medium">{variable.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {variable.group}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* Footer com ações */}
        <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
          <div className="text-xs text-muted-foreground">
            Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">Enter</kbd> to save
          </div>
          <div className="flex items-center gap-2">
            {variable?.formula && (
              <button
                onClick={handleClear}
                className="px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 rounded transition-colors"
              >
                Clear formula
              </button>
            )}
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
            >
              <span>Save</span>
              <CornerDownLeft className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

