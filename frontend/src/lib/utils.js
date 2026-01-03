import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value)
}

export function formatPercent(value) {
  return `${value > 0 ? '+' : ''}${value}%`
}

export function formatDate(date) {
  if (!date) return ''
  // Se for string ISO (YYYY-MM-DD), parse manualmente para evitar problemas de timezone
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)) {
    const [datePart] = date.split('T') // Remove parte de tempo se existir
    const [year, month, day] = datePart.split('-').map(Number)
    // Cria data no timezone local (meio-dia para evitar edge cases)
    const localDate = new Date(year, month - 1, day, 12, 0, 0)
    return new Intl.DateTimeFormat('pt-BR').format(localDate)
  }
  return new Intl.DateTimeFormat('pt-BR').format(new Date(date))
}


