/**
 * Detecta o tipo de valor baseado no input do usuário
 * Similar ao Causal.app
 */

// Padrões para detecção de tipo
const PATTERNS = {
  currency: /^\$?\s*[\d,]+\.?\d*$|^R\$\s*[\d,.]+$/i,
  percentage: /^[\d,.]+\s*%$|^\d+\.?\d*\s*%\s*(to|a|-)\s*\d+\.?\d*\s*%$/i,
  range: /^[\d,.]+\s*(to|a|-)\s*[\d,.]+$/i,
  number: /^[\d,.]+$/,
}

/**
 * Detecta o tipo do valor baseado no texto inserido
 * @param {string} input - Texto digitado pelo usuário
 * @returns {'currency' | 'percentage' | 'range' | 'number'}
 */
export function detectType(input) {
  if (!input || typeof input !== 'string') return 'number'
  
  const trimmed = input.trim()
  
  // Detecta moeda primeiro ($50, R$ 100)
  if (trimmed.startsWith('$') || trimmed.startsWith('R$')) {
    return 'currency'
  }
  
  // Detecta porcentagem (5%, 5% to 10%)
  if (PATTERNS.percentage.test(trimmed)) {
    return 'percentage'
  }
  
  // Detecta range (100 to 200)
  if (PATTERNS.range.test(trimmed)) {
    return 'range'
  }
  
  return 'number'
}

/**
 * Parseia o valor do input para número ou range
 * @param {string} input - Texto digitado
 * @param {'currency' | 'percentage' | 'range' | 'number'} type - Tipo detectado
 * @returns {number | {min: number, max: number}}
 */
export function parseValue(input, type) {
  if (!input || typeof input !== 'string') return 0
  
  const trimmed = input.trim()
  
  // Remove símbolos de moeda
  let cleaned = trimmed
    .replace(/^\$\s*/, '')
    .replace(/^R\$\s*/, '')
    .replace(/%/g, '')
    .replace(/,/g, '')
    .trim()
  
  // Parseia range (5 to 10, 5 a 10, 5 - 10)
  const rangeMatch = cleaned.match(/^([\d.]+)\s*(?:to|a|-)\s*([\d.]+)$/)
  if (rangeMatch) {
    return {
      min: parseFloat(rangeMatch[1]) || 0,
      max: parseFloat(rangeMatch[2]) || 0,
    }
  }
  
  // Valor simples
  const numValue = parseFloat(cleaned) || 0
  
  // Percentuais são armazenados como decimais internamente (5% = 0.05)
  if (type === 'percentage') {
    return numValue / 100
  }
  
  return numValue
}

/**
 * Formata valor para exibição
 * @param {number | {min: number, max: number}} value - Valor
 * @param {'currency' | 'percentage' | 'range' | 'number'} type - Tipo
 * @returns {string}
 */
export function formatValue(value, type) {
  if (value === null || value === undefined) return '-'
  
  // Range
  if (typeof value === 'object' && 'min' in value && 'max' in value) {
    if (type === 'percentage') {
      return `${(value.min * 100).toFixed(1)}% to ${(value.max * 100).toFixed(1)}%`
    }
    return `${value.min.toLocaleString('pt-BR')} to ${value.max.toLocaleString('pt-BR')}`
  }
  
  const num = typeof value === 'number' ? value : parseFloat(value) || 0
  
  switch (type) {
    case 'currency':
      return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    case 'percentage':
      return `${(num * 100).toFixed(1)}%`
    default:
      return num.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  }
}

/**
 * Retorna o ícone para o tipo
 * @param {'currency' | 'percentage' | 'range' | 'number'} type
 * @returns {string}
 */
export function getTypeIcon(type) {
  switch (type) {
    case 'currency':
      return '$'
    case 'percentage':
      return '%'
    default:
      return '#'
  }
}

/**
 * Obtém o valor médio de um range ou o próprio valor
 * @param {number | {min: number, max: number}} value
 * @returns {number}
 */
export function getMidValue(value) {
  if (value === null || value === undefined) {
    return 0
  }
  if (typeof value === 'object' && 'min' in value && 'max' in value) {
    return (value.min + value.max) / 2
  }
  return typeof value === 'number' ? value : 0
}

