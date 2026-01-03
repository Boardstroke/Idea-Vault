import CausalSpreadsheet from '../components/CausalSpreadsheet'
import ModelsGallery from '../components/ModelsGallery'
import { useModelsStore } from '../hooks/useModelsStore'

/**
 * Página de Modelos - Galeria + Spreadsheet estilo Causal
 */
export default function Orcamento() {
  const { activeModelId, selectModel, getActiveModel } = useModelsStore()
  
  const activeModel = getActiveModel()
  
  // Se há um modelo ativo, mostra o spreadsheet
  if (activeModelId && activeModel) {
    return <CausalSpreadsheet modelId={activeModelId} />
  }
  
  // Se não há modelo ativo, mostra a galeria
  return <ModelsGallery onSelectModel={selectModel} />
}
