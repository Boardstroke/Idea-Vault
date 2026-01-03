import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Plus, CornerDownLeft, Database, ArrowUpRight } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useSpreadsheetStore } from '../../hooks/useSpreadsheetStore'

/**
 * InlineVariableCreator - Cria variáveis inline na tabela
 * 
 * Features:
 * - Input inline com autocomplete
 * - Sugestão "+ Create 'nome'"
 * - Enter para confirmar
 * - Menu com opções adicionais
 */
export default function InlineVariableCreator({ group = 'inputs' }) {
  const [isCreating, setIsCreating] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [showMenu, setShowMenu] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 })
  const inputRef = useRef(null)
  const containerRef = useRef(null)
  const menuRef = useRef(null)
  
  const { addVariable, variables } = useSpreadsheetStore()
  
  // Calcula posição do menu
  const updateMenuPosition = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      setMenuPosition({
        left: rect.left,
        top: rect.bottom + 4,
      })
    }
  }, [])
  
  // Foca no input quando começa a criar
  useEffect(() => {
    if (isCreating && inputRef.current) {
      inputRef.current.focus()
      updateMenuPosition()
    }
  }, [isCreating, updateMenuPosition])
  
  // Fecha ao clicar fora (considera tanto o container quanto o menu do portal)
  useEffect(() => {
    const handleClickOutside = (e) => {
      const clickedInContainer = containerRef.current?.contains(e.target)
      const clickedInMenu = menuRef.current?.contains(e.target)
      
      if (!clickedInContainer && !clickedInMenu) {
        handleCancel()
      }
    }
    
    if (isCreating) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isCreating])
  
  const handleStartCreating = () => {
    setIsCreating(true)
    setShowMenu(true)
    setInputValue('')
    // Posição será calculada no useEffect quando isCreating mudar
  }
  
  const handleCancel = () => {
    setIsCreating(false)
    setShowMenu(false)
    setInputValue('')
  }
  
  const handleCreate = () => {
    if (!inputValue.trim()) return
    
    // Verifica se já existe variável com mesmo nome
    const exists = variables.some(
      v => v.name.toLowerCase() === inputValue.trim().toLowerCase()
    )
    
    if (exists) {
      // Poderia mostrar erro aqui
      return
    }
    
    addVariable(inputValue.trim(), group)
    handleCancel()
  }
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleCreate()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }
  
  const handleInputChange = (e) => {
    setInputValue(e.target.value)
    if (e.target.value) {
      setShowMenu(true)
      updateMenuPosition()
    }
  }
  
  if (!isCreating) {
    return (
      <button
        onClick={handleStartCreating}
        className="flex items-center gap-2 w-full px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
      >
        <Plus className="w-4 h-4" />
        <span>New Variable</span>
      </button>
    )
  }
  
  return (
    <div ref={containerRef} className="relative h-10">
      {/* Input de criação */}
      <div className="flex items-center gap-2 px-4 h-10 bg-background">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Enter variable name..."
          className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground"
        />
      </div>
      
      {/* Menu de opções - renderizado via Portal para escapar do overflow */}
      {showMenu && createPortal(
        <div 
          ref={menuRef}
          className="fixed bg-popover border rounded-lg shadow-lg overflow-hidden"
          style={{
            zIndex: 9999,
            width: '280px',
            left: menuPosition.left,
            top: menuPosition.top,
          }}
        >
          {/* Opção: Criar nova variável */}
          {inputValue.trim() && (
            <button
              onClick={handleCreate}
              className="flex items-center gap-3 w-full px-3 py-2 text-sm text-left hover:bg-accent transition-colors"
            >
              <Plus className="w-4 h-4 text-primary" />
              <span className="flex-1">
                Create "<span className="font-medium">{inputValue.trim()}</span>"
              </span>
              <CornerDownLeft className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
          
          {/* Opção: Criar de dados */}
          <button
            className="flex items-center gap-3 w-full px-3 py-2 text-sm text-left hover:bg-accent transition-colors border-t"
          >
            <Database className="w-4 h-4 text-muted-foreground" />
            <div className="flex-1">
              <div>Create from data</div>
              <div className="text-xs text-muted-foreground">
                Create a new variable from a data item
              </div>
            </div>
          </button>
          
          {/* Opção: Importar variável */}
          <button
            className="flex items-center gap-3 w-full px-3 py-2 text-sm text-left hover:bg-accent transition-colors border-t"
          >
            <ArrowUpRight className="w-4 h-4 text-muted-foreground" />
            <div className="flex-1">
              <div>Import variable</div>
              <div className="text-xs text-muted-foreground">
                Reference a variable from a different model
              </div>
            </div>
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}

