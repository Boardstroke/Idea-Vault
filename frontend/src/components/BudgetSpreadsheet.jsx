import { useState, useMemo, useCallback } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getExpandedRowModel,
  flexRender,
} from '@tanstack/react-table'
import { ChevronRight, ChevronDown, Plus, DollarSign, Hash, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { formatCurrency, cn } from '../lib/utils'

const MESES = [
  { key: 'jan', label: 'JAN' },
  { key: 'fev', label: 'FEV' },
  { key: 'mar', label: 'MAR' },
  { key: 'abr', label: 'ABR' },
  { key: 'mai', label: 'MAI' },
  { key: 'jun', label: 'JUN' },
  { key: 'jul', label: 'JUL' },
  { key: 'ago', label: 'AGO' },
  { key: 'set', label: 'SET' },
  { key: 'out', label: 'OUT' },
  { key: 'nov', label: 'NOV' },
  { key: 'dez', label: 'DEZ' },
]

// Mini sparkline component
function Sparkline({ values, className }) {
  if (!values || values.length === 0) return null
  
  const max = Math.max(...values.filter(v => v > 0), 1)
  const min = Math.min(...values.filter(v => v >= 0), 0)
  const range = max - min || 1
  
  const width = 60
  const height = 20
  const padding = 2
  
  const points = values.map((val, i) => {
    const x = padding + (i / (values.length - 1 || 1)) * (width - 2 * padding)
    const y = height - padding - ((val - min) / range) * (height - 2 * padding)
    return `${x},${y}`
  }).join(' ')
  
  // Determinar tendência
  const firstHalf = values.slice(0, Math.floor(values.length / 2))
  const secondHalf = values.slice(Math.floor(values.length / 2))
  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / (firstHalf.length || 1)
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / (secondHalf.length || 1)
  const trend = avgSecond > avgFirst ? 'up' : avgSecond < avgFirst ? 'down' : 'stable'
  
  const color = trend === 'up' ? '#ef4444' : trend === 'down' ? '#22c55e' : '#6b7280'
  
  return (
    <svg width={width} height={height} className={className}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      {/* Último ponto destacado */}
      {values.length > 0 && (
        <circle
          cx={width - padding}
          cy={height - padding - ((values[values.length - 1] - min) / range) * (height - 2 * padding)}
          r="2"
          fill={color}
        />
      )}
    </svg>
  )
}

// Formatar valor com parênteses para negativos (estilo Causal)
function formatValueCausal(value, showCurrency = true) {
  if (value === null || value === undefined) return '-'
  const num = parseFloat(value)
  if (isNaN(num)) return '-'
  
  const isNegative = num < 0
  const absValue = Math.abs(num)
  const formatted = showCurrency 
    ? absValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : absValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
  
  return isNegative ? `(${formatted})` : formatted
}

// Ícone de tipo (R$ ou #)
function TypeIcon({ tipo }) {
  if (tipo === 'monetario' || tipo === undefined) {
    return (
      <span className="flex items-center justify-center w-5 h-5 rounded bg-emerald-500/10 text-emerald-600 text-xs font-bold">
        R$
      </span>
    )
  }
  return (
    <span className="flex items-center justify-center w-5 h-5 rounded bg-blue-500/10 text-blue-600">
      <Hash className="w-3 h-3" />
    </span>
  )
}

// Indicador de tendência
function TrendIndicator({ values }) {
  if (!values || values.length < 2) return null
  
  const recent = values.slice(-3)
  const older = values.slice(0, 3)
  const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length
  const avgOlder = older.reduce((a, b) => a + b, 0) / older.length
  
  if (avgRecent > avgOlder * 1.1) {
    return <TrendingUp className="w-3 h-3 text-red-500" />
  } else if (avgRecent < avgOlder * 0.9) {
    return <TrendingDown className="w-3 h-3 text-green-500" />
  }
  return <Minus className="w-3 h-3 text-muted-foreground" />
}

// Célula editável para valores orçados
function EditableCell({ getValue, row, column, table }) {
  const initialValue = getValue()
  const [value, setValue] = useState(initialValue)
  const [isEditing, setIsEditing] = useState(false)

  // Grupos não são editáveis
  if (row.original.tipo === 'grupo') {
    return null
  }

  const onBlur = () => {
    setIsEditing(false)
    const numValue = parseFloat(value) || 0
    if (numValue !== initialValue) {
      table.options.meta?.updateData(row.original.id, column.id, numValue)
    }
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur()
    }
    if (e.key === 'Escape') {
      setValue(initialValue)
      setIsEditing(false)
    }
  }

  if (isEditing) {
    return (
      <input
        type="number"
        value={value || ''}
        onChange={e => setValue(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        autoFocus
        className="w-full bg-background border-2 border-primary rounded px-2 py-1 text-right text-sm focus:outline-none"
      />
    )
  }

  const isNegative = value < 0

  return (
    <div
      onClick={() => setIsEditing(true)}
      className={cn(
        "cursor-pointer px-2 py-1 text-right text-sm hover:bg-muted/50 rounded transition-colors",
        isNegative && "text-red-500"
      )}
    >
      {value ? formatValueCausal(value) : '-'}
    </div>
  )
}

// Célula de valor real (somente leitura)
function RealValueCell({ getValue, row }) {
  const value = getValue()
  
  if (row.original.tipo === 'grupo') {
    return null
  }

  const isNegative = value < 0

  return (
    <div className={cn(
      "px-2 py-1 text-right text-sm",
      isNegative ? "text-red-500 font-medium" : "text-muted-foreground"
    )}>
      {value ? formatValueCausal(value) : '-'}
    </div>
  )
}

// Célula de variação percentual
function VariacaoCell({ row, mesKey }) {
  if (row.original.tipo === 'grupo') {
    return null
  }

  const orcado = row.original[`${mesKey}_orcado`]
  const real = row.original[`${mesKey}_real`]

  if (!orcado || !real) {
    return <div className="px-2 py-1 text-right text-sm text-muted-foreground">-</div>
  }

  const variacao = ((real - orcado) / orcado) * 100
  const isPositive = variacao > 0
  const isNegative = variacao < 0

  // Para despesas: positivo = ruim (gastou mais), negativo = bom (gastou menos)
  // Para receitas: positivo = bom (recebeu mais), negativo = ruim (recebeu menos)
  const isDespesa = row.original.tipoCategoria === 'despesa'
  const colorClass = isDespesa
    ? (isPositive ? 'text-red-500' : isNegative ? 'text-green-500' : 'text-muted-foreground')
    : (isPositive ? 'text-green-500' : isNegative ? 'text-red-500' : 'text-muted-foreground')

  return (
    <div className={`px-2 py-1 text-right text-sm font-medium ${colorClass}`}>
      {isPositive ? '+' : ''}{variacao.toFixed(1)}%
    </div>
  )
}

// Célula de total da linha
function TotalCell({ row, tipo }) {
  if (row.original.tipo === 'grupo') {
    // Calcular total do grupo (soma dos filhos)
    const children = row.original.children || []
    const total = children.reduce((sum, child) => {
      const childTotal = MESES.reduce((s, m) => s + (child[`${m.key}_${tipo}`] || 0), 0)
      return sum + childTotal
    }, 0)
    const isNegative = total < 0
    return (
      <div className={cn(
        "px-2 py-1 text-right text-sm font-bold",
        isNegative && "text-red-500"
      )}>
        {formatValueCausal(total)}
      </div>
    )
  }

  const total = MESES.reduce((sum, mes) => sum + (row.original[`${mes.key}_${tipo}`] || 0), 0)
  const isNegative = total < 0
  return (
    <div className={cn(
      "px-2 py-1 text-right text-sm font-medium",
      isNegative && "text-red-500"
    )}>
      {formatValueCausal(total)}
    </div>
  )
}

// Botão de adicionar nova variável
function AddVariableButton({ onClick, groupId }) {
  return (
    <button
      onClick={() => onClick(groupId)}
      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors py-1 px-2 hover:bg-muted/50 rounded ml-6"
    >
      <Plus className="w-3 h-3" />
      <span>Nova Categoria</span>
    </button>
  )
}

export default function BudgetSpreadsheet({ data, onDataChange, onAddCategory }) {
  const [tableData, setTableData] = useState(data)
  const [selectedRowId, setSelectedRowId] = useState(null)

  const updateData = useCallback((rowId, columnId, value) => {
    setTableData(old => {
      const newData = old.map(group => {
        if (group.children) {
          return {
            ...group,
            children: group.children.map(row => {
              if (row.id === rowId) {
                return { ...row, [columnId]: value }
              }
              return row
            })
          }
        }
        return group
      })
      onDataChange?.(newData)
      return newData
    })
  }, [onDataChange])

  // Extrair valores mensais para sparkline
  const getMonthlyValues = useCallback((row, tipo = 'real') => {
    return MESES.map(mes => row[`${mes.key}_${tipo}`] || 0)
  }, [])

  // Contar referências (simula o contador do Causal)
  const getRefCount = useCallback((row) => {
    // Simular contagem de referências baseado nos valores preenchidos
    return MESES.filter(mes => row[`${mes.key}_real`] > 0).length
  }, [])

  const columns = useMemo(() => {
    const baseColumns = [
      {
        accessorKey: 'categoria',
        header: () => <div className="text-left font-semibold">Categoria</div>,
        size: 220,
        cell: ({ row, getValue }) => {
          const isGroup = row.original.tipo === 'grupo'
          const isSelected = row.original.id === selectedRowId
          const values = !isGroup ? getMonthlyValues(row.original) : null
          const refCount = !isGroup ? getRefCount(row.original) : null
          
          return (
            <div 
              style={{ paddingLeft: `${row.depth * 12}px` }} 
              className="flex items-center gap-2"
            >
              {row.getCanExpand() ? (
                <button
                  onClick={row.getToggleExpandedHandler()}
                  className="p-0.5 hover:bg-muted rounded transition-colors"
                >
                  {row.getIsExpanded() ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              ) : (
                <>
                  <TypeIcon tipo={row.original.tipoValor} />
                </>
              )}
              <span className={cn(
                "flex-1 truncate",
                isGroup ? 'font-bold text-primary uppercase text-xs tracking-wider' : ''
              )}>
                {getValue()}
              </span>
              {/* Sparkline para linhas não-grupo */}
              {!isGroup && values && (
                <Sparkline values={values} className="opacity-70" />
              )}
              {/* Contador de referências */}
              {!isGroup && refCount > 0 && (
                <span className="flex items-center gap-0.5 text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  {refCount}
                </span>
              )}
            </div>
          )
        },
      },
    ]

    // Colunas para cada mês (Orçado | Real | Δ%)
    MESES.forEach(mes => {
      baseColumns.push({
        id: `${mes.key}_header`,
        header: () => (
          <div className="text-center font-semibold border-l border-border pl-2">
            {mes.label}
          </div>
        ),
        columns: [
          {
            accessorKey: `${mes.key}_orcado`,
            header: () => <div className="text-right text-xs text-muted-foreground">Orçado</div>,
            size: 90,
            cell: EditableCell,
          },
          {
            accessorKey: `${mes.key}_real`,
            header: () => <div className="text-right text-xs text-muted-foreground">Real</div>,
            size: 90,
            cell: RealValueCell,
          },
          {
            id: `${mes.key}_variacao`,
            header: () => <div className="text-right text-xs text-muted-foreground">Δ%</div>,
            size: 60,
            cell: ({ row }) => <VariacaoCell row={row} mesKey={mes.key} />,
          },
        ],
      })
    })

    // Colunas de total
    baseColumns.push({
      id: 'totais',
      header: () => (
        <div className="text-center font-semibold border-l border-border pl-2">
          TOTAL
        </div>
      ),
      columns: [
        {
          id: 'total_orcado',
          header: () => <div className="text-right text-xs text-muted-foreground">Orçado</div>,
          size: 100,
          cell: ({ row }) => <TotalCell row={row} tipo="orcado" />,
        },
        {
          id: 'total_real',
          header: () => <div className="text-right text-xs text-muted-foreground">Real</div>,
          size: 100,
          cell: ({ row }) => <TotalCell row={row} tipo="real" />,
        },
      ],
    })

    return baseColumns
  }, [selectedRowId, getMonthlyValues, getRefCount])

  const table = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSubRows: row => row.children,
    initialState: {
      expanded: true, // Expandir tudo por padrão
    },
    meta: {
      updateData,
    },
  })

  const handleAddCategory = (groupId) => {
    if (onAddCategory) {
      onAddCategory(groupId)
    } else {
      console.log('Add category to group:', groupId)
    }
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id} className="bg-muted/50">
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    colSpan={header.colSpan}
                    className="px-2 py-3 text-left text-sm font-medium border-b border-border"
                    style={{ width: header.getSize() }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, rowIndex) => {
              const isGroup = row.original.tipo === 'grupo'
              const isSelected = row.original.id === selectedRowId
              const isLastChildOfGroup = !isGroup && (
                rowIndex === table.getRowModel().rows.length - 1 ||
                table.getRowModel().rows[rowIndex + 1]?.original.tipo === 'grupo'
              )
              
              return (
                <>
                  <tr
                    key={row.id}
                    onClick={() => !isGroup && setSelectedRowId(row.original.id)}
                    className={cn(
                      "border-b border-border/50 transition-all cursor-pointer",
                      isGroup && "bg-muted/30",
                      !isGroup && "hover:bg-muted/20",
                      isSelected && "bg-primary/5 ring-2 ring-primary/30 ring-inset"
                    )}
                  >
                    {row.getVisibleCells().map(cell => (
                      <td
                        key={cell.id}
                        className="py-1.5"
                        style={{ width: cell.column.getSize() }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                  {/* Botão de adicionar após último filho do grupo */}
                  {isLastChildOfGroup && row.getParentRow() && (
                    <tr key={`add-${row.id}`} className="border-b border-border/30">
                      <td colSpan={row.getVisibleCells().length} className="py-0.5">
                        <AddVariableButton 
                          onClick={handleAddCategory} 
                          groupId={row.getParentRow()?.original.id} 
                        />
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
      
      {/* Legenda */}
      <div className="flex items-center gap-6 px-4 py-2 border-t border-border/50 bg-muted/20 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="flex items-center justify-center w-4 h-4 rounded bg-emerald-500/10 text-emerald-600 text-[10px] font-bold">
            R$
          </span>
          <span>Valor monetário</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Sparkline values={[30, 45, 35, 50, 60]} className="opacity-70" />
          <span>Tendência</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-0.5 text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            N
          </span>
          <span>Meses com dados</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-red-500">(R$ 100,00)</span>
          <span>Valor negativo</span>
        </div>
      </div>
    </div>
  )
}
