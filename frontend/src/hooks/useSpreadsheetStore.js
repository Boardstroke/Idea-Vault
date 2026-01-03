import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { detectType, parseValue, getMidValue } from '../lib/typeDetector'

// Gera array de meses para o período
function generateMonths(startYear = 2024, startMonth = 1, count = 24) {
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

// Formata mês para exibição (2024-01 -> JAN '24)
export function formatMonth(monthKey) {
  const [year, month] = monthKey.split('-')
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  return `${monthNames[parseInt(month, 10) - 1]} '${year.slice(2)}`
}

// Obtém o mês anterior
export function getPreviousMonth(monthKey) {
  const [year, month] = monthKey.split('-').map(Number)
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  return `${prevYear}-${String(prevMonth).padStart(2, '0')}`
}

// Obtém o próximo mês
export function getNextMonth(monthKey) {
  const [year, month] = monthKey.split('-').map(Number)
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`
}

// Estado inicial
const initialState = {
  variables: [],
  months: generateMonths(2024, 1, 24),
  selectedCell: null, // { variableId, monthKey }
  editingCell: null, // { variableId, monthKey }
  editingFormula: null, // variableId
  history: [],
  historyIndex: -1,
}

export const useSpreadsheetStore = create(
  persist(
    (set, get) => ({
      ...initialState,
      
      // ==================== CARREGAR MODELO ====================
      
      /**
       * Carrega dados de um modelo no spreadsheet
       */
      loadModelData: (modelData) => {
        if (!modelData) {
          set(initialState)
          return
        }
        
        set({
          variables: modelData.variables || [],
          months: modelData.months || generateMonths(2024, 1, 24),
          selectedCell: null,
          editingCell: null,
          editingFormula: null,
        })
      },
      
      /**
       * Retorna os dados atuais do spreadsheet para salvar no modelo
       */
      getModelData: () => {
        const { variables, months } = get()
        return { variables, months }
      },
      
      // ==================== VARIÁVEIS ====================
      
      /**
       * Adiciona nova variável
       */
      addVariable: (name, group = 'inputs') => {
        const id = `var_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
        const newVariable = {
          id,
          name,
          type: 'number',
          group,
          formula: null,
          values: {},
          overrides: {},
        }
        
        set((state) => ({
          variables: [...state.variables, newVariable],
        }))
        
        get().saveHistory()
        return id
      },
      
      /**
       * Remove variável
       */
      removeVariable: (id) => {
        set((state) => ({
          variables: state.variables.filter((v) => v.id !== id),
        }))
        get().saveHistory()
      },
      
      /**
       * Renomeia variável
       */
      renameVariable: (id, newName) => {
        set((state) => ({
          variables: state.variables.map((v) =>
            v.id === id ? { ...v, name: newName } : v
          ),
        }))
        get().saveHistory()
      },
      
      /**
       * Move variável para outro grupo
       */
      moveVariable: (id, newGroup) => {
        set((state) => ({
          variables: state.variables.map((v) =>
            v.id === id ? { ...v, group: newGroup } : v
          ),
        }))
        get().saveHistory()
      },
      
      // ==================== VALORES ====================
      
      /**
       * Define valor em uma célula específica
       */
      setValue: (variableId, monthKey, rawInput) => {
        const type = detectType(rawInput)
        const value = parseValue(rawInput, type)
        
        set((state) => ({
          variables: state.variables.map((v) => {
            if (v.id !== variableId) return v
            
            return {
              ...v,
              type, // Atualiza tipo baseado no input
              values: {
                ...v.values,
                [monthKey]: value,
              },
              // Se tem fórmula, este é um override
              overrides: v.formula
                ? { ...v.overrides, [monthKey]: value }
                : v.overrides,
            }
          }),
        }))
        
        get().recalculateAll()
        get().saveHistory()
      },
      
      /**
       * Remove override de um mês específico (volta a usar fórmula)
       */
      removeOverride: (variableId, monthKey) => {
        set((state) => ({
          variables: state.variables.map((v) => {
            if (v.id !== variableId) return v
            
            const { [monthKey]: _, ...restOverrides } = v.overrides
            return { ...v, overrides: restOverrides }
          }),
        }))
        
        get().recalculateAll()
      },
      
      /**
       * Aplica valor a múltiplos meses (drag extend)
       */
      extendValue: (variableId, fromMonth, toMonth, value) => {
        const { months } = get()
        const fromIndex = months.indexOf(fromMonth)
        const toIndex = months.indexOf(toMonth)
        
        if (fromIndex === -1 || toIndex === -1) return
        
        const start = Math.min(fromIndex, toIndex)
        const end = Math.max(fromIndex, toIndex)
        
        set((state) => ({
          variables: state.variables.map((v) => {
            if (v.id !== variableId) return v
            
            const newValues = { ...v.values }
            for (let i = start; i <= end; i++) {
              newValues[months[i]] = value
            }
            
            return { ...v, values: newValues }
          }),
        }))
        
        get().recalculateAll()
        get().saveHistory()
      },
      
      // ==================== FÓRMULAS ====================
      
      /**
       * Define fórmula para uma variável
       */
      setFormula: (variableId, formulaStr) => {
        set((state) => ({
          variables: state.variables.map((v) => {
            if (v.id !== variableId) return v
            
            if (!formulaStr || formulaStr.trim() === '') {
              return { ...v, formula: null }
            }
            
            // Detecta tipo baseado no conteúdo da fórmula
            const trimmed = formulaStr.trim()
            let newType = v.type
            
            // Se a fórmula é um valor simples de porcentagem (ex: "5%", "10.5%")
            if (/^[\d.]+\s*%$/.test(trimmed)) {
              newType = 'percentage'
            }
            // Se a fórmula é um valor simples de moeda (ex: "$100", "R$ 50")
            else if (/^[\$R\$]\s*[\d,.]+$/.test(trimmed)) {
              newType = 'currency'
            }
            
            return {
              ...v,
              type: newType,
              formula: {
                raw: formulaStr,
                tokens: get().tokenizeFormula(formulaStr),
              },
              // NÃO muda o grupo - variáveis permanecem onde foram criadas
            }
          }),
        }))
        
        get().recalculateAll()
        get().saveHistory()
      },
      
      /**
       * Tokeniza uma fórmula em partes
       * Suporta:
       * - $variableName - referência a variável pelo nome
       * - $monthIndex - índice do mês (1-12)
       * - $yearIndex - ano (ex: 2024)
       * - $periodIndex - índice do período (0, 1, 2...)
       * - $max, $min, $abs, etc - funções matemáticas
       * - Nome da variável sem $ (compatibilidade)
       */
      tokenizeFormula: (formulaStr) => {
        const tokens = []
        const { variables } = get()
        
        let remaining = formulaStr
        
        // Ordena variáveis por tamanho do nome (maior primeiro) para match correto
        const sortedVars = [...variables].sort((a, b) => b.name.length - a.name.length)
        
        // Lista de funções suportadas
        const FUNCTIONS = ['max', 'min', 'abs', 'round', 'floor', 'ceil', 'pow', 'sqrt', 'if', 'sum', 'avg']
        
        while (remaining.length > 0) {
          let matched = false
          
          // 1. Match funções matemáticas ($max, $min, etc)
          const funcMatch = remaining.match(/^\$(max|min|abs|round|floor|ceil|pow|sqrt|if|sum|avg)\s*\(/i)
          if (funcMatch) {
            const funcName = funcMatch[1].toLowerCase()
            // Encontra os argumentos da função (conteúdo entre parênteses)
            const startIdx = funcMatch[0].length - 1 // posição do (
            let depth = 1
            let endIdx = startIdx + 1
            
            while (depth > 0 && endIdx < remaining.length) {
              if (remaining[endIdx] === '(') depth++
              else if (remaining[endIdx] === ')') depth--
              endIdx++
            }
            
            const argsStr = remaining.slice(startIdx + 1, endIdx - 1)
            
            tokens.push({
              type: 'function',
              name: funcName,
              argsRaw: argsStr, // Args serão parseados durante computeFormula
            })
            
            remaining = remaining.slice(endIdx).trim()
            matched = true
            continue
          }
          
          // 2. Match variáveis do sistema ($monthIndex, $yearIndex, $periodIndex)
          const systemVarMatch = remaining.match(/^\$(monthIndex|yearIndex|periodIndex)/i)
          if (systemVarMatch) {
            tokens.push({
              type: 'systemVariable',
              name: systemVarMatch[1].toLowerCase(),
            })
            remaining = remaining.slice(systemVarMatch[0].length).trim()
            matched = true
            continue
          }
          
          // 3. Match referência de variável com $ ($NomeVariavel)
          const dollarVarMatch = remaining.match(/^\$(\w+)/)
          if (dollarVarMatch) {
            const varName = dollarVarMatch[1]
            const variable = variables.find(v => 
              v.name.toLowerCase() === varName.toLowerCase()
            )
            
            if (variable) {
              tokens.push({
                type: 'variable',
                variableId: variable.id,
                variableName: variable.name,
                timeShift: 'same',
              })
              remaining = remaining.slice(dollarVarMatch[0].length).trim()
              matched = true
              continue
            }
          }
          
          // 4. Match variáveis pelo nome (sem $, compatibilidade)
          for (const variable of sortedVars) {
            const varPattern = new RegExp(`^${escapeRegex(variable.name)}(?:\\s*\\[([^\\]]+)\\])?`, 'i')
            const match = remaining.match(varPattern)
            
            if (match) {
              tokens.push({
                type: 'variable',
                variableId: variable.id,
                variableName: variable.name,
                timeShift: parseTimeShift(match[1]),
              })
              remaining = remaining.slice(match[0].length).trim()
              matched = true
              break
            }
          }
          
          if (!matched) {
            // Match percentuais primeiro (5%, 10.5%)
            const percentMatch = remaining.match(/^([\d.]+)\s*%/)
            if (percentMatch) {
              // Converte porcentagem para decimal (5% -> 0.05)
              const decimalValue = parseFloat(percentMatch[1]) / 100
              tokens.push({
                type: 'operator',
                value: String(decimalValue),
              })
              remaining = remaining.slice(percentMatch[0].length).trim()
            }
            // Match operadores e números (inclui vírgula para separar args)
            else {
              const opMatch = remaining.match(/^([+\-*/()0-9.,\s]+)/)
              if (opMatch) {
                tokens.push({
                  type: 'operator',
                  value: opMatch[1].trim(),
                })
                remaining = remaining.slice(opMatch[0].length).trim()
              } else {
                // Caractere não reconhecido, pula
                remaining = remaining.slice(1).trim()
              }
            }
          }
        }
        
        return tokens
      },
      
      /**
       * Calcula o valor de uma fórmula para um mês específico
       */
      computeFormula: (variableId, monthKey) => {
        const { variables, months } = get()
        const variable = variables.find((v) => v.id === variableId)
        
        if (!variable || !variable.formula) return null
        
        // Se tem override para este mês, usa o override
        if (variable.overrides[monthKey] !== undefined) {
          return variable.overrides[monthKey]
        }
        
        // Extrai informações do mês
        const [year, month] = monthKey.split('-').map(Number)
        const periodIndex = months.indexOf(monthKey)
        
        // Contexto para avaliação
        const context = { year, month, periodIndex, variables, monthKey, get }
        
        try {
          let expression = ''
          
          for (const token of variable.formula.tokens) {
            if (token.type === 'operator') {
              expression += ` ${token.value} `
            } else if (token.type === 'function') {
              // Avalia função matemática
              const funcResult = evaluateFunction(token.name, token.argsRaw, context)
              expression += ` ${funcResult} `
            } else if (token.type === 'systemVariable') {
              // Resolve variáveis do sistema
              switch (token.name) {
                case 'monthindex':
                  expression += ` ${month} `
                  break
                case 'yearindex':
                  expression += ` ${year} `
                  break
                case 'periodindex':
                  expression += ` ${periodIndex} `
                  break
                default:
                  expression += ' 0 '
              }
            } else if (token.type === 'variable') {
              const refVar = variables.find((v) => v.id === token.variableId)
              if (!refVar) continue
              
              // Aplica time shift
              let targetMonth = monthKey
              if (token.timeShift === 'previous') {
                targetMonth = getPreviousMonth(monthKey)
              } else if (token.timeShift === 'next') {
                targetMonth = getNextMonth(monthKey)
              }
              
              // Obtém valor (recursivo para variáveis calculadas)
              let value = refVar.values[targetMonth]
              if (refVar.formula && value === undefined) {
                value = get().computeFormula(refVar.id, targetMonth)
              }
              
              expression += ` ${getMidValue(value) || 0} `
            }
          }
          
          // Avalia expressão (usando Function para segurança básica)
          const result = new Function(`return ${expression}`)()
          return typeof result === 'number' && !isNaN(result) ? result : 0
        } catch (e) {
          console.warn('Erro ao computar fórmula:', e)
          return 0
        }
      },
      
      /**
       * Recalcula todos os valores derivados de fórmulas
       */
      recalculateAll: () => {
        const { variables, months } = get()
        
        set((state) => ({
          variables: state.variables.map((v) => {
            if (!v.formula) return v
            
            const newValues = { ...v.values }
            
            for (const month of months) {
              // Não recalcula overrides
              if (v.overrides[month] === undefined) {
                const computed = get().computeFormula(v.id, month)
                if (computed !== null) {
                  newValues[month] = computed
                }
              }
            }
            
            return { ...v, values: newValues }
          }),
        }))
      },
      
      // ==================== SELEÇÃO ====================
      
      selectCell: (variableId, monthKey) => {
        set({ selectedCell: { variableId, monthKey } })
      },
      
      clearSelection: () => {
        set({ selectedCell: null })
      },
      
      startEditing: (variableId, monthKey) => {
        set({ editingCell: { variableId, monthKey } })
      },
      
      stopEditing: () => {
        set({ editingCell: null })
      },
      
      startEditingFormula: (variableId) => {
        set({ editingFormula: variableId })
      },
      
      stopEditingFormula: () => {
        set({ editingFormula: null })
      },
      
      // ==================== HISTÓRICO ====================
      
      saveHistory: () => {
        const { variables, historyIndex, history } = get()
        const newHistory = history.slice(0, historyIndex + 1)
        newHistory.push(JSON.stringify(variables))
        
        // Mantém apenas últimos 50 estados
        if (newHistory.length > 50) {
          newHistory.shift()
        }
        
        set({
          history: newHistory,
          historyIndex: newHistory.length - 1,
        })
      },
      
      undo: () => {
        const { history, historyIndex } = get()
        if (historyIndex > 0) {
          const prevState = JSON.parse(history[historyIndex - 1])
          set({
            variables: prevState,
            historyIndex: historyIndex - 1,
          })
        }
      },
      
      redo: () => {
        const { history, historyIndex } = get()
        if (historyIndex < history.length - 1) {
          const nextState = JSON.parse(history[historyIndex + 1])
          set({
            variables: nextState,
            historyIndex: historyIndex + 1,
          })
        }
      },
      
      // ==================== GETTERS ====================
      
      getVariable: (id) => {
        return get().variables.find((v) => v.id === id)
      },
      
      getVariablesByGroup: (group) => {
        return get().variables.filter((v) => v.group === group)
      },
      
      getValue: (variableId, monthKey) => {
        const variable = get().getVariable(variableId)
        if (!variable) return null
        
        // Override tem prioridade
        if (variable.overrides[monthKey] !== undefined) {
          return variable.overrides[monthKey]
        }
        
        // Valor pré-calculado
        if (variable.values[monthKey] !== undefined) {
          return variable.values[monthKey]
        }
        
        // Calcular fórmula se existir
        if (variable.formula) {
          return get().computeFormula(variableId, monthKey)
        }
        
        return null
      },
      
      // ==================== RESET ====================
      
      reset: () => {
        set({
          ...initialState,
          months: generateMonths(2024, 1, 24),
        })
      },
    }),
    {
      name: 'causal-spreadsheet-storage',
      partialize: (state) => ({
        variables: state.variables,
        months: state.months,
      }),
    }
  )
)

// Helpers
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseTimeShift(modifier) {
  if (!modifier) return 'same'
  const lower = modifier.toLowerCase()
  if (lower.includes('previous') || lower.includes('anterior')) return 'previous'
  if (lower.includes('next') || lower.includes('próximo')) return 'next'
  return 'same'
}

/**
 * Avalia uma função matemática com seus argumentos
 */
function evaluateFunction(funcName, argsRaw, context) {
  const { year, month, periodIndex, variables, monthKey, get } = context
  
  // Parse dos argumentos (split por vírgula, mas respeitando parênteses aninhados)
  const args = parseArguments(argsRaw).map(arg => 
    evaluateExpression(arg.trim(), context)
  )
  
  switch (funcName) {
    case 'max':
      return Math.max(...args)
    case 'min':
      return Math.min(...args)
    case 'abs':
      return Math.abs(args[0] || 0)
    case 'round':
      return Math.round(args[0] || 0)
    case 'floor':
      return Math.floor(args[0] || 0)
    case 'ceil':
      return Math.ceil(args[0] || 0)
    case 'pow':
      return Math.pow(args[0] || 0, args[1] || 1)
    case 'sqrt':
      return Math.sqrt(args[0] || 0)
    case 'if':
      // $if(condition, thenValue, elseValue)
      return args[0] ? (args[1] || 0) : (args[2] || 0)
    case 'sum':
      return args.reduce((a, b) => a + b, 0)
    case 'avg':
      return args.length > 0 ? args.reduce((a, b) => a + b, 0) / args.length : 0
    default:
      return 0
  }
}

/**
 * Separa argumentos de função respeitando parênteses aninhados
 */
function parseArguments(argsStr) {
  const args = []
  let current = ''
  let depth = 0
  
  for (const char of argsStr) {
    if (char === '(' || char === '[') {
      depth++
      current += char
    } else if (char === ')' || char === ']') {
      depth--
      current += char
    } else if (char === ',' && depth === 0) {
      args.push(current)
      current = ''
    } else {
      current += char
    }
  }
  
  if (current.trim()) {
    args.push(current)
  }
  
  return args
}

/**
 * Avalia uma expressão simples (pode conter variáveis, números, operadores)
 */
function evaluateExpression(expr, context) {
  const { year, month, periodIndex, variables, monthKey, get } = context
  
  let processed = expr
  
  // Resolve funções aninhadas primeiro
  const funcMatch = processed.match(/\$(max|min|abs|round|floor|ceil|pow|sqrt|if|sum|avg)\s*\(/)
  if (funcMatch) {
    const funcName = funcMatch[1].toLowerCase()
    const startIdx = funcMatch.index + funcMatch[0].length - 1
    let depth = 1
    let endIdx = startIdx + 1
    
    while (depth > 0 && endIdx < processed.length) {
      if (processed[endIdx] === '(') depth++
      else if (processed[endIdx] === ')') depth--
      endIdx++
    }
    
    const argsStr = processed.slice(startIdx + 1, endIdx - 1)
    const funcResult = evaluateFunction(funcName, argsStr, context)
    
    processed = processed.slice(0, funcMatch.index) + funcResult + processed.slice(endIdx)
    // Avalia novamente caso haja mais expressões
    return evaluateExpression(processed, context)
  }
  
  // Resolve variáveis do sistema
  processed = processed.replace(/\$monthIndex/gi, month)
  processed = processed.replace(/\$yearIndex/gi, year)
  processed = processed.replace(/\$periodIndex/gi, periodIndex)
  
  // Resolve variáveis de usuário ($NomeVariavel)
  const varMatches = processed.matchAll(/\$(\w+)/g)
  for (const match of Array.from(varMatches)) {
    const varName = match[1]
    const variable = variables.find(v => 
      v.name.toLowerCase() === varName.toLowerCase()
    )
    
    if (variable) {
      let value = variable.values[monthKey]
      if (variable.formula && value === undefined) {
        value = get().computeFormula(variable.id, monthKey)
      }
      processed = processed.replace(match[0], getMidValue(value) || 0)
    }
  }
  
  // Avalia a expressão final
  try {
    const result = new Function(`return ${processed}`)()
    return typeof result === 'number' && !isNaN(result) ? result : 0
  } catch (e) {
    console.warn('Erro ao avaliar expressão:', expr, e)
    return 0
  }
}

export default useSpreadsheetStore

