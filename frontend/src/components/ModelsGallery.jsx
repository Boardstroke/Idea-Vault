import { useState } from 'react'
import { Plus, FileSpreadsheet, Clock, Trash2, Copy, ArrowLeft, Check, X } from 'lucide-react'
import { cn } from '../lib/utils'
import { useModelsStore, MODEL_TEMPLATES } from '../hooks/useModelsStore'

/**
 * ModelsGallery - Galeria de modelos estilo grid
 */
export default function ModelsGallery({ onSelectModel }) {
  const { models, createModel, deleteModel, duplicateModel } = useModelsStore()
  const [showNewModelDialog, setShowNewModelDialog] = useState(false)
  const [newModelName, setNewModelName] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('blank')
  const [deletingModelId, setDeletingModelId] = useState(null)
  
  const handleCreateModel = () => {
    if (!newModelName.trim()) return
    
    const id = createModel(newModelName.trim(), selectedTemplate)
    setShowNewModelDialog(false)
    setNewModelName('')
    setSelectedTemplate('blank')
    onSelectModel(id)
  }
  
  const handleDeleteModel = (id) => {
    deleteModel(id)
    setDeletingModelId(null)
  }
  
  const handleDuplicateModel = (id) => {
    duplicateModel(id)
  }
  
  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }
  
  // Dialog de criar novo modelo
  if (showNewModelDialog) {
    return (
      <div className="flex flex-col h-full p-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => setShowNewModelDialog(false)}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold">Criar Novo Modelo</h1>
            <p className="text-muted-foreground">Escolha um template para começar</p>
          </div>
        </div>
        
        {/* Nome do modelo */}
        <div className="mb-8">
          <label className="block text-sm font-medium mb-2">Nome do Modelo</label>
          <input
            type="text"
            value={newModelName}
            onChange={(e) => setNewModelName(e.target.value)}
            placeholder="Ex: Projeção Financeira 2024"
            className="w-full max-w-md px-4 py-3 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newModelName.trim()) {
                handleCreateModel()
              }
            }}
          />
        </div>
        
        {/* Templates */}
        <div className="mb-8">
          <label className="block text-sm font-medium mb-4">Selecione um Template</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {MODEL_TEMPLATES.map((template) => (
              <button
                key={template.id}
                onClick={() => setSelectedTemplate(template.id)}
                className={cn(
                  "flex flex-col items-start p-6 rounded-xl border-2 transition-all text-left",
                  selectedTemplate === template.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-muted/50"
                )}
              >
                <span className="text-4xl mb-3">{template.icon}</span>
                <span className="font-medium">{template.name}</span>
                <span className="text-sm text-muted-foreground mt-1">
                  {template.description}
                </span>
                {selectedTemplate === template.id && (
                  <span className="mt-3 text-xs text-primary font-medium flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    Selecionado
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
        
        {/* Botão criar */}
        <div className="flex gap-3">
          <button
            onClick={handleCreateModel}
            disabled={!newModelName.trim()}
            className={cn(
              "px-6 py-3 rounded-lg font-medium transition-colors",
              newModelName.trim()
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            Criar Modelo
          </button>
          <button
            onClick={() => setShowNewModelDialog(false)}
            className="px-6 py-3 rounded-lg font-medium hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }
  
  return (
    <div className="flex flex-col h-full p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Modelos</h1>
        <p className="text-muted-foreground">
          Crie e gerencie seus modelos de projeção financeira
        </p>
      </div>
      
      {/* Grid de modelos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {/* Card de criar novo */}
        <button
          onClick={() => setShowNewModelDialog(true)}
          className="group flex flex-col items-center justify-center p-8 rounded-xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-all min-h-[200px]"
        >
          <div className="w-14 h-14 rounded-full bg-muted group-hover:bg-primary/10 flex items-center justify-center mb-4 transition-colors">
            <Plus className="w-7 h-7 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <span className="font-medium text-muted-foreground group-hover:text-foreground transition-colors">
            Novo Modelo
          </span>
          <span className="text-xs text-muted-foreground mt-2 text-center max-w-[160px]">
            Crie projeções financeiras do zero
          </span>
        </button>
        
        {/* Cards dos modelos existentes */}
        {models.map((model) => (
          <div
            key={model.id}
            className="group relative flex flex-col p-6 rounded-xl border bg-card hover:border-primary/50 hover:shadow-lg transition-all min-h-[200px]"
          >
            {/* Estado: Confirmando exclusão */}
            {deletingModelId === model.id ? (
              <div className="flex flex-col items-center justify-center h-full">
                <span className="text-sm text-destructive mb-4">Excluir este modelo?</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDeleteModel(model.id)}
                    className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors text-sm font-medium"
                  >
                    Excluir
                  </button>
                  <button
                    onClick={() => setDeletingModelId(null)}
                    className="px-4 py-2 rounded-lg hover:bg-muted transition-colors text-sm"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Conteúdo do card */}
                <button
                  onClick={() => onSelectModel(model.id)}
                  className="flex flex-col items-start flex-1 text-left"
                >
                  <div className={cn(
                    "w-12 h-12 rounded-lg flex items-center justify-center mb-4",
                    "bg-primary/10"
                  )}>
                    <FileSpreadsheet className="w-6 h-6 text-primary" />
                  </div>
                  
                  <h3 className="font-medium text-lg mb-1 group-hover:text-primary transition-colors">
                    {model.name}
                  </h3>
                  
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-auto">
                    <Clock className="w-3 h-3" />
                    <span>Atualizado em {formatDate(model.updatedAt)}</span>
                  </div>
                </button>
                
                {/* Ações do card */}
                <div className={cn(
                  "absolute top-3 right-3 flex items-center gap-1 transition-opacity",
                  "opacity-0 group-hover:opacity-100"
                )}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDuplicateModel(model.id)
                    }}
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="Duplicar"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeletingModelId(model.id)
                    }}
                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

