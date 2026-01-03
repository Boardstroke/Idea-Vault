import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Templates disponíveis para criação de modelos
 */
export const MODEL_TEMPLATES = [
  {
    id: 'blank',
    name: 'Modelo em Branco',
    description: 'Comece do zero com um modelo vazio',
    icon: '📄',
    color: 'bg-slate-500/10',
  },
  {
    id: 'cashflow',
    name: 'Fluxo de Caixa Pessoal',
    description: 'Controle suas entradas, saídas e poupança mensal',
    icon: '💰',
    color: 'bg-emerald-500/10',
  },
  {
    id: 'pnl',
    name: 'Profit & Loss',
    description: 'Income statement with revenue, costs and profit',
    icon: '📊',
    color: 'bg-blue-500/10',
  },
]

/**
 * Dados iniciais para o template Fluxo de Caixa Pessoal
 */
const CASHFLOW_TEMPLATE_DATA = {
  variables: [
    // === ENTRADAS ===
    {
      id: 'var_salario',
      name: 'Salário',
      type: 'currency',
      group: 'entradas',
      formula: null,
      values: {
        '2025-01': 8000, '2025-02': 8000, '2025-03': 8000, '2025-04': 8000,
        '2025-05': 8000, '2025-06': 8000, '2025-07': 8000, '2025-08': 8000,
        '2025-09': 8000, '2025-10': 8000, '2025-11': 8000, '2025-12': 16000, // 13º
      },
      overrides: {},
    },
    {
      id: 'var_freelance',
      name: 'Freelance / Renda Extra',
      type: 'currency',
      group: 'entradas',
      formula: null,
      values: {
        '2025-01': 500, '2025-02': 800, '2025-03': 600, '2025-04': 1000,
        '2025-05': 700, '2025-06': 500, '2025-07': 900, '2025-08': 600,
        '2025-09': 800, '2025-10': 1200, '2025-11': 700, '2025-12': 500,
      },
      overrides: {},
    },
    {
      id: 'var_rendimentos',
      name: 'Rendimentos (Investimentos)',
      type: 'currency',
      group: 'entradas',
      formula: null,
      values: {
        '2025-01': 150, '2025-02': 160, '2025-03': 155, '2025-04': 170,
        '2025-05': 165, '2025-06': 180, '2025-07': 175, '2025-08': 190,
        '2025-09': 185, '2025-10': 200, '2025-11': 195, '2025-12': 210,
      },
      overrides: {},
    },
    {
      id: 'var_total_entradas',
      name: '📥 Total Entradas',
      type: 'currency',
      group: 'entradas',
      formula: { 
        raw: '$Salário + $Freelance / Renda Extra + $Rendimentos (Investimentos)', 
        tokens: [
          { type: 'variable', variableId: 'var_salario', variableName: 'Salário', timeShift: 'same' },
          { type: 'operator', value: '+' },
          { type: 'variable', variableId: 'var_freelance', variableName: 'Freelance / Renda Extra', timeShift: 'same' },
          { type: 'operator', value: '+' },
          { type: 'variable', variableId: 'var_rendimentos', variableName: 'Rendimentos (Investimentos)', timeShift: 'same' },
        ]
      },
      values: {},
      overrides: {},
    },
    
    // === SAÍDAS FIXAS ===
    {
      id: 'var_aluguel',
      name: 'Aluguel / Moradia',
      type: 'currency',
      group: 'saidas_fixas',
      formula: { raw: '2500', tokens: [{ type: 'operator', value: '2500' }] },
      values: {},
      overrides: {},
    },
    {
      id: 'var_financiamento',
      name: 'Financiamento (Carro/Imóvel)',
      type: 'currency',
      group: 'saidas_fixas',
      formula: { raw: '800', tokens: [{ type: 'operator', value: '800' }] },
      values: {},
      overrides: {},
    },
    {
      id: 'var_planos',
      name: 'Planos (Internet, Celular, Streaming)',
      type: 'currency',
      group: 'saidas_fixas',
      formula: { raw: '350', tokens: [{ type: 'operator', value: '350' }] },
      values: {},
      overrides: {},
    },
    {
      id: 'var_saude',
      name: 'Saúde (Plano/Academia)',
      type: 'currency',
      group: 'saidas_fixas',
      formula: { raw: '400', tokens: [{ type: 'operator', value: '400' }] },
      values: {},
      overrides: {},
    },
    {
      id: 'var_total_fixas',
      name: '📌 Total Saídas Fixas',
      type: 'currency',
      group: 'saidas_fixas',
      formula: { 
        raw: '$Aluguel / Moradia + $Financiamento (Carro/Imóvel) + $Planos (Internet, Celular, Streaming) + $Saúde (Plano/Academia)', 
        tokens: [
          { type: 'variable', variableId: 'var_aluguel', variableName: 'Aluguel / Moradia', timeShift: 'same' },
          { type: 'operator', value: '+' },
          { type: 'variable', variableId: 'var_financiamento', variableName: 'Financiamento (Carro/Imóvel)', timeShift: 'same' },
          { type: 'operator', value: '+' },
          { type: 'variable', variableId: 'var_planos', variableName: 'Planos (Internet, Celular, Streaming)', timeShift: 'same' },
          { type: 'operator', value: '+' },
          { type: 'variable', variableId: 'var_saude', variableName: 'Saúde (Plano/Academia)', timeShift: 'same' },
        ]
      },
      values: {},
      overrides: {},
    },
    
    // === SAÍDAS VARIÁVEIS ===
    {
      id: 'var_mercado',
      name: 'Mercado / Alimentação',
      type: 'currency',
      group: 'saidas_variaveis',
      formula: null,
      values: {
        '2025-01': 1200, '2025-02': 1100, '2025-03': 1150, '2025-04': 1180,
        '2025-05': 1220, '2025-06': 1100, '2025-07': 1250, '2025-08': 1180,
        '2025-09': 1150, '2025-10': 1200, '2025-11': 1300, '2025-12': 1500,
      },
      overrides: {},
    },
    {
      id: 'var_lazer',
      name: 'Lazer / Entretenimento',
      type: 'currency',
      group: 'saidas_variaveis',
      formula: null,
      values: {
        '2025-01': 600, '2025-02': 500, '2025-03': 700, '2025-04': 550,
        '2025-05': 650, '2025-06': 800, '2025-07': 900, '2025-08': 600,
        '2025-09': 550, '2025-10': 700, '2025-11': 600, '2025-12': 1200,
      },
      overrides: {},
    },
    {
      id: 'var_transporte',
      name: 'Transporte',
      type: 'currency',
      group: 'saidas_variaveis',
      formula: null,
      values: {
        '2025-01': 400, '2025-02': 380, '2025-03': 420, '2025-04': 390,
        '2025-05': 410, '2025-06': 400, '2025-07': 380, '2025-08': 420,
        '2025-09': 400, '2025-10': 430, '2025-11': 400, '2025-12': 450,
      },
      overrides: {},
    },
    {
      id: 'var_compras',
      name: 'Compras / Vestuário',
      type: 'currency',
      group: 'saidas_variaveis',
      formula: null,
      values: {
        '2025-01': 200, '2025-02': 150, '2025-03': 300, '2025-04': 100,
        '2025-05': 250, '2025-06': 400, '2025-07': 200, '2025-08': 150,
        '2025-09': 180, '2025-10': 300, '2025-11': 500, '2025-12': 800,
      },
      overrides: {},
    },
    {
      id: 'var_total_variaveis',
      name: '🔄 Total Saídas Variáveis',
      type: 'currency',
      group: 'saidas_variaveis',
      formula: { 
        raw: '$Mercado / Alimentação + $Lazer / Entretenimento + $Transporte + $Compras / Vestuário', 
        tokens: [
          { type: 'variable', variableId: 'var_mercado', variableName: 'Mercado / Alimentação', timeShift: 'same' },
          { type: 'operator', value: '+' },
          { type: 'variable', variableId: 'var_lazer', variableName: 'Lazer / Entretenimento', timeShift: 'same' },
          { type: 'operator', value: '+' },
          { type: 'variable', variableId: 'var_transporte', variableName: 'Transporte', timeShift: 'same' },
          { type: 'operator', value: '+' },
          { type: 'variable', variableId: 'var_compras', variableName: 'Compras / Vestuário', timeShift: 'same' },
        ]
      },
      values: {},
      overrides: {},
    },
    
    // === RESULTADO ===
    {
      id: 'var_total_saidas',
      name: '📤 Total Saídas',
      type: 'currency',
      group: 'resultado',
      formula: { 
        raw: '$📌 Total Saídas Fixas + $🔄 Total Saídas Variáveis', 
        tokens: [
          { type: 'variable', variableId: 'var_total_fixas', variableName: '📌 Total Saídas Fixas', timeShift: 'same' },
          { type: 'operator', value: '+' },
          { type: 'variable', variableId: 'var_total_variaveis', variableName: '🔄 Total Saídas Variáveis', timeShift: 'same' },
        ]
      },
      values: {},
      overrides: {},
    },
    {
      id: 'var_poupanca',
      name: '💵 Poupança do Mês',
      type: 'currency',
      group: 'resultado',
      formula: { 
        raw: '$📥 Total Entradas - $📤 Total Saídas', 
        tokens: [
          { type: 'variable', variableId: 'var_total_entradas', variableName: '📥 Total Entradas', timeShift: 'same' },
          { type: 'operator', value: '-' },
          { type: 'variable', variableId: 'var_total_saidas', variableName: '📤 Total Saídas', timeShift: 'same' },
        ]
      },
      values: {},
      overrides: {},
    },
    {
      id: 'var_taxa_poupanca',
      name: '📊 Taxa de Poupança',
      type: 'percentage',
      group: 'resultado',
      formula: { 
        raw: '$💵 Poupança do Mês / $📥 Total Entradas', 
        tokens: [
          { type: 'variable', variableId: 'var_poupanca', variableName: '💵 Poupança do Mês', timeShift: 'same' },
          { type: 'operator', value: '/' },
          { type: 'variable', variableId: 'var_total_entradas', variableName: '📥 Total Entradas', timeShift: 'same' },
        ]
      },
      values: {},
      overrides: {},
    },
  ],
}

/**
 * Dados iniciais para o template P&L
 */
const PNL_TEMPLATE_DATA = {
  variables: [
    // === INPUTS ===
    {
      id: 'var_revenue',
      name: 'Revenue',
      type: 'currency',
      group: 'inputs',
      formula: null,
      values: {
        '2024-01': 100000, '2024-02': 105000, '2024-03': 110000, '2024-04': 115000,
        '2024-05': 120000, '2024-06': 125000, '2024-07': 130000, '2024-08': 135000,
        '2024-09': 140000, '2024-10': 145000, '2024-11': 150000, '2024-12': 160000,
      },
      overrides: {},
    },
    {
      id: 'var_cogs_pct',
      name: 'COGS %',
      type: 'percentage',
      group: 'inputs',
      formula: { raw: '35%', tokens: [{ type: 'operator', value: '0.35' }] },
      values: {},
      overrides: {},
    },
    {
      id: 'var_opex',
      name: 'Operating Expenses',
      type: 'currency',
      group: 'inputs',
      formula: null,
      values: {
        '2024-01': 25000, '2024-02': 25000, '2024-03': 26000, '2024-04': 26000,
        '2024-05': 27000, '2024-06': 27000, '2024-07': 28000, '2024-08': 28000,
        '2024-09': 29000, '2024-10': 29000, '2024-11': 30000, '2024-12': 32000,
      },
      overrides: {},
    },
    {
      id: 'var_depreciation',
      name: 'Depreciation',
      type: 'currency',
      group: 'inputs',
      formula: { raw: '5000', tokens: [{ type: 'operator', value: '5000' }] },
      values: {},
      overrides: {},
    },
    {
      id: 'var_interest',
      name: 'Interest Expense',
      type: 'currency',
      group: 'inputs',
      formula: { raw: '2000', tokens: [{ type: 'operator', value: '2000' }] },
      values: {},
      overrides: {},
    },
    {
      id: 'var_tax_rate',
      name: 'Tax Rate',
      type: 'percentage',
      group: 'inputs',
      formula: { raw: '25%', tokens: [{ type: 'operator', value: '0.25' }] },
      values: {},
      overrides: {},
    },
    
    // === CALCULATIONS ===
    {
      id: 'var_cogs',
      name: 'COGS',
      type: 'currency',
      group: 'calculations',
      formula: { 
        raw: '$Revenue * $COGS %', 
        tokens: [
          { type: 'variable', variableId: 'var_revenue', variableName: 'Revenue', timeShift: 'same' },
          { type: 'operator', value: '*' },
          { type: 'variable', variableId: 'var_cogs_pct', variableName: 'COGS %', timeShift: 'same' },
        ]
      },
      values: {},
      overrides: {},
    },
    {
      id: 'var_gross_profit',
      name: 'Gross Profit',
      type: 'currency',
      group: 'calculations',
      formula: { 
        raw: '$Revenue - $COGS', 
        tokens: [
          { type: 'variable', variableId: 'var_revenue', variableName: 'Revenue', timeShift: 'same' },
          { type: 'operator', value: '-' },
          { type: 'variable', variableId: 'var_cogs', variableName: 'COGS', timeShift: 'same' },
        ]
      },
      values: {},
      overrides: {},
    },
    {
      id: 'var_ebitda',
      name: 'EBITDA',
      type: 'currency',
      group: 'calculations',
      formula: { 
        raw: '$Gross Profit - $Operating Expenses', 
        tokens: [
          { type: 'variable', variableId: 'var_gross_profit', variableName: 'Gross Profit', timeShift: 'same' },
          { type: 'operator', value: '-' },
          { type: 'variable', variableId: 'var_opex', variableName: 'Operating Expenses', timeShift: 'same' },
        ]
      },
      values: {},
      overrides: {},
    },
    {
      id: 'var_ebit',
      name: 'EBIT',
      type: 'currency',
      group: 'calculations',
      formula: { 
        raw: '$EBITDA - $Depreciation', 
        tokens: [
          { type: 'variable', variableId: 'var_ebitda', variableName: 'EBITDA', timeShift: 'same' },
          { type: 'operator', value: '-' },
          { type: 'variable', variableId: 'var_depreciation', variableName: 'Depreciation', timeShift: 'same' },
        ]
      },
      values: {},
      overrides: {},
    },
    {
      id: 'var_ebt',
      name: 'EBT',
      type: 'currency',
      group: 'calculations',
      formula: { 
        raw: '$EBIT - $Interest Expense', 
        tokens: [
          { type: 'variable', variableId: 'var_ebit', variableName: 'EBIT', timeShift: 'same' },
          { type: 'operator', value: '-' },
          { type: 'variable', variableId: 'var_interest', variableName: 'Interest Expense', timeShift: 'same' },
        ]
      },
      values: {},
      overrides: {},
    },
    {
      id: 'var_taxes',
      name: 'Taxes',
      type: 'currency',
      group: 'calculations',
      formula: { 
        raw: '$EBT * $Tax Rate', 
        tokens: [
          { type: 'variable', variableId: 'var_ebt', variableName: 'EBT', timeShift: 'same' },
          { type: 'operator', value: '*' },
          { type: 'variable', variableId: 'var_tax_rate', variableName: 'Tax Rate', timeShift: 'same' },
        ]
      },
      values: {},
      overrides: {},
    },
    {
      id: 'var_net_income',
      name: 'Net Income',
      type: 'currency',
      group: 'calculations',
      formula: { 
        raw: '$EBT - $Taxes', 
        tokens: [
          { type: 'variable', variableId: 'var_ebt', variableName: 'EBT', timeShift: 'same' },
          { type: 'operator', value: '-' },
          { type: 'variable', variableId: 'var_taxes', variableName: 'Taxes', timeShift: 'same' },
        ]
      },
      values: {},
      overrides: {},
    },
    {
      id: 'var_net_margin',
      name: 'Net Margin',
      type: 'percentage',
      group: 'calculations',
      formula: { 
        raw: '$Net Income / $Revenue', 
        tokens: [
          { type: 'variable', variableId: 'var_net_income', variableName: 'Net Income', timeShift: 'same' },
          { type: 'operator', value: '/' },
          { type: 'variable', variableId: 'var_revenue', variableName: 'Revenue', timeShift: 'same' },
        ]
      },
      values: {},
      overrides: {},
    },
  ],
}

/**
 * Store para gerenciar múltiplos modelos
 */
export const useModelsStore = create(
  persist(
    (set, get) => ({
      models: [],
      activeModelId: null,
      
      /**
       * Cria um novo modelo
       */
      createModel: (name, templateId = 'blank') => {
        const id = `model_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
        const now = new Date().toISOString()
        
        // Dados iniciais baseados no template
        let initialData = {
          variables: [],
          months: generateMonths(2025, 1, 24),
        }
        
        // Aplica dados do template Fluxo de Caixa
        if (templateId === 'cashflow') {
          initialData = {
            ...CASHFLOW_TEMPLATE_DATA,
            months: generateMonths(2025, 1, 24),
          }
        }
        
        // Aplica dados do template P&L
        if (templateId === 'pnl') {
          initialData = {
            ...PNL_TEMPLATE_DATA,
            months: generateMonths(2024, 1, 24),
          }
        }
        
        const newModel = {
          id,
          name,
          templateId,
          createdAt: now,
          updatedAt: now,
          data: initialData,
        }
        
        set((state) => ({
          models: [...state.models, newModel],
          activeModelId: id,
        }))
        
        return id
      },
      
      /**
       * Seleciona um modelo para edição
       */
      selectModel: (id) => {
        set({ activeModelId: id })
      },
      
      /**
       * Volta para a lista de modelos
       */
      deselectModel: () => {
        set({ activeModelId: null })
      },
      
      /**
       * Atualiza dados de um modelo
       */
      updateModel: (id, updates) => {
        set((state) => ({
          models: state.models.map((m) =>
            m.id === id
              ? { ...m, ...updates, updatedAt: new Date().toISOString() }
              : m
          ),
        }))
      },
      
      /**
       * Renomeia um modelo
       */
      renameModel: (id, newName) => {
        set((state) => ({
          models: state.models.map((m) =>
            m.id === id
              ? { ...m, name: newName, updatedAt: new Date().toISOString() }
              : m
          ),
        }))
      },
      
      /**
       * Exclui um modelo
       */
      deleteModel: (id) => {
        set((state) => ({
          models: state.models.filter((m) => m.id !== id),
          activeModelId: state.activeModelId === id ? null : state.activeModelId,
        }))
      },
      
      /**
       * Duplica um modelo
       */
      duplicateModel: (id) => {
        const { models } = get()
        const model = models.find((m) => m.id === id)
        if (!model) return null
        
        const newId = `model_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
        const now = new Date().toISOString()
        
        const newModel = {
          ...model,
          id: newId,
          name: `${model.name} (Copy)`,
          createdAt: now,
          updatedAt: now,
        }
        
        set((state) => ({
          models: [...state.models, newModel],
        }))
        
        return newId
      },
      
      /**
       * Obtém modelo ativo
       */
      getActiveModel: () => {
        const { models, activeModelId } = get()
        return models.find((m) => m.id === activeModelId) || null
      },
    }),
    {
      name: 'causal-models-storage',
    }
  )
)

// Helper para gerar meses
function generateMonths(startYear, startMonth, count) {
  const months = []
  let year = startYear
  let month = startMonth
  
  for (let i = 0; i < count; i++) {
    months.push(`${year}-${String(month).padStart(2, '0')}`)
    month++
    if (month > 12) {
      month = 1
      year++
    }
  }
  
  return months
}

export default useModelsStore

