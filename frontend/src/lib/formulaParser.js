/**
 * Formula Parser para planilha estilo Causal
 * 
 * Suporta:
 * - Referências a variáveis: "Revenue", "Growth rate"
 * - Time shifting: "Sales[previous month]", "Revenue[next month]"
 * - Operadores: +, -, *, /, (, )
 * - Números: 100, 1.5, .25
 */

/**
 * Token types
 */
export const TokenType = {
  VARIABLE: 'variable',
  NUMBER: 'number',
  OPERATOR: 'operator',
  PAREN_OPEN: 'paren_open',
  PAREN_CLOSE: 'paren_close',
  TIME_SHIFT: 'time_shift',
}

/**
 * Time shift modifiers
 */
export const TimeShift = {
  SAME: 'same',
  PREVIOUS: 'previous',
  NEXT: 'next',
}

/**
 * Tokeniza uma fórmula em tokens
 * @param {string} formula - Fórmula como string
 * @param {Array} variables - Lista de variáveis disponíveis
 * @returns {Array} Array de tokens
 */
export function tokenize(formula, variables = []) {
  const tokens = []
  let pos = 0
  const input = formula.trim()
  
  // Ordena variáveis por tamanho do nome (maior primeiro) para match correto
  const sortedVars = [...variables].sort((a, b) => b.name.length - a.name.length)
  
  while (pos < input.length) {
    // Pula espaços
    if (/\s/.test(input[pos])) {
      pos++
      continue
    }
    
    // Tenta match com variáveis
    let varMatched = false
    for (const variable of sortedVars) {
      const remaining = input.slice(pos)
      const varPattern = new RegExp(`^${escapeRegex(variable.name)}(?:\\s*\\[([^\\]]+)\\])?`, 'i')
      const match = remaining.match(varPattern)
      
      if (match) {
        const timeShift = parseTimeShiftModifier(match[1])
        tokens.push({
          type: TokenType.VARIABLE,
          variableId: variable.id,
          variableName: variable.name,
          timeShift,
          raw: match[0],
        })
        pos += match[0].length
        varMatched = true
        break
      }
    }
    
    if (varMatched) continue
    
    // Números
    const numMatch = input.slice(pos).match(/^(\d+\.?\d*|\.\d+)/)
    if (numMatch) {
      tokens.push({
        type: TokenType.NUMBER,
        value: parseFloat(numMatch[1]),
        raw: numMatch[0],
      })
      pos += numMatch[0].length
      continue
    }
    
    // Operadores
    const char = input[pos]
    if (['+', '-', '*', '/'].includes(char)) {
      tokens.push({
        type: TokenType.OPERATOR,
        value: char,
        raw: char,
      })
      pos++
      continue
    }
    
    // Parênteses
    if (char === '(') {
      tokens.push({
        type: TokenType.PAREN_OPEN,
        value: '(',
        raw: '(',
      })
      pos++
      continue
    }
    
    if (char === ')') {
      tokens.push({
        type: TokenType.PAREN_CLOSE,
        value: ')',
        raw: ')',
      })
      pos++
      continue
    }
    
    // Caractere não reconhecido - pula
    pos++
  }
  
  return tokens
}

/**
 * Avalia uma fórmula tokenizada para um mês específico
 * @param {Array} tokens - Tokens da fórmula
 * @param {string} monthKey - Mês de referência (ex: "2024-01")
 * @param {Function} getVariableValue - Função para obter valor de variável
 * @returns {number} Resultado da avaliação
 */
export function evaluate(tokens, monthKey, getVariableValue) {
  try {
    // Converte tokens em expressão avaliável
    let expression = ''
    
    for (const token of tokens) {
      switch (token.type) {
        case TokenType.VARIABLE: {
          // Obtém mês alvo baseado no time shift
          const targetMonth = applyTimeShift(monthKey, token.timeShift)
          const value = getVariableValue(token.variableId, targetMonth)
          expression += ` ${value || 0} `
          break
        }
        case TokenType.NUMBER:
          expression += ` ${token.value} `
          break
        case TokenType.OPERATOR:
        case TokenType.PAREN_OPEN:
        case TokenType.PAREN_CLOSE:
          expression += token.value
          break
      }
    }
    
    // Avalia a expressão
    // Usando Function() é mais seguro que eval() pois não tem acesso ao escopo
    const result = new Function(`return ${expression}`)()
    return typeof result === 'number' && !isNaN(result) && isFinite(result) ? result : 0
  } catch (e) {
    console.warn('Erro ao avaliar fórmula:', e)
    return 0
  }
}

/**
 * Converte tokens de volta para string legível
 * @param {Array} tokens - Array de tokens
 * @returns {string} Fórmula como string
 */
export function tokensToString(tokens) {
  return tokens.map(token => token.raw).join(' ')
}

/**
 * Valida se uma fórmula é válida
 * @param {Array} tokens - Tokens da fórmula
 * @returns {{valid: boolean, error?: string}}
 */
export function validateFormula(tokens) {
  if (tokens.length === 0) {
    return { valid: false, error: 'Fórmula vazia' }
  }
  
  let parenDepth = 0
  let prevToken = null
  
  for (const token of tokens) {
    if (token.type === TokenType.PAREN_OPEN) {
      parenDepth++
    } else if (token.type === TokenType.PAREN_CLOSE) {
      parenDepth--
      if (parenDepth < 0) {
        return { valid: false, error: 'Parênteses não balanceados' }
      }
    }
    
    // Verifica operadores consecutivos
    if (token.type === TokenType.OPERATOR && prevToken?.type === TokenType.OPERATOR) {
      return { valid: false, error: 'Operadores consecutivos' }
    }
    
    prevToken = token
  }
  
  if (parenDepth !== 0) {
    return { valid: false, error: 'Parênteses não balanceados' }
  }
  
  return { valid: true }
}

/**
 * Encontra variáveis referenciadas em uma fórmula
 * @param {Array} tokens - Tokens da fórmula
 * @returns {Array} IDs das variáveis referenciadas
 */
export function getReferencedVariables(tokens) {
  return tokens
    .filter(t => t.type === TokenType.VARIABLE)
    .map(t => t.variableId)
}

// Helpers

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseTimeShiftModifier(modifier) {
  if (!modifier) return TimeShift.SAME
  const lower = modifier.toLowerCase().trim()
  
  if (lower.includes('previous') || lower.includes('anterior') || lower.includes('last')) {
    return TimeShift.PREVIOUS
  }
  if (lower.includes('next') || lower.includes('próximo') || lower.includes('following')) {
    return TimeShift.NEXT
  }
  return TimeShift.SAME
}

function applyTimeShift(monthKey, shift) {
  const [year, month] = monthKey.split('-').map(Number)
  
  switch (shift) {
    case TimeShift.PREVIOUS: {
      const prevMonth = month === 1 ? 12 : month - 1
      const prevYear = month === 1 ? year - 1 : year
      return `${prevYear}-${String(prevMonth).padStart(2, '0')}`
    }
    case TimeShift.NEXT: {
      const nextMonth = month === 12 ? 1 : month + 1
      const nextYear = month === 12 ? year + 1 : year
      return `${nextYear}-${String(nextMonth).padStart(2, '0')}`
    }
    default:
      return monthKey
  }
}

/**
 * Obtém sugestões de autocomplete para fórmula
 * @param {string} partial - Texto parcial digitado
 * @param {Array} variables - Lista de variáveis disponíveis
 * @returns {Array} Sugestões de autocomplete
 */
export function getAutocompleteSuggestions(partial, variables) {
  if (!partial) return variables.slice(0, 5)
  
  const lower = partial.toLowerCase()
  return variables
    .filter(v => v.name.toLowerCase().includes(lower))
    .slice(0, 5)
}

