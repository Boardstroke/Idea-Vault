import { useState, useEffect } from 'react'
import { Brain, TrendingUp, TrendingDown, Calendar, RefreshCw, Info, ChevronRight } from 'lucide-react'
import { 
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, ResponsiveContainer, 
  ReferenceLine, Legend, ComposedChart
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '../components/ui/chart'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { api } from '../lib/api'
import { formatCurrency, cn } from '../lib/utils'

const COLORS = {
  historico: '#6366f1',
  previsao: '#22c55e',
  inferior: '#94a3b8',
  superior: '#94a3b8',
}

const chartConfig = {
  historico: { label: 'Histórico', color: COLORS.historico },
  previsao: { label: 'Previsão', color: COLORS.previsao },
}

export default function PrevisaoML() {
  const [resumo, setResumo] = useState(null)
  const [previsoes, setPrevisoes] = useState([])
  const [categorias, setCategorias] = useState([])
  const [categoriaSelecionada, setCategoriaSelecionada] = useState(null)
  const [categoriaDetalhe, setCategoriaDetalhe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    try {
      setLoading(true)
      setError(null)
      
      const [resumoData, previsoesData, categoriasData] = await Promise.all([
        api.getPrevisaoMLResumo(),
        api.getPrevisaoML(),
        api.getPrevisaoMLCategorias(),
      ])
      
      setResumo(resumoData)
      setPrevisoes(previsoesData)
      setCategorias(categoriasData)
    } catch (err) {
      console.error('Erro ao carregar previsões ML:', err)
      setError('Não foi possível carregar as previsões. O modelo pode não ter sido treinado ainda.')
    } finally {
      setLoading(false)
    }
  }

  async function fetchCategoriaDetalhe(categoria) {
    try {
      setCategoriaSelecionada(categoria)
      const data = await api.getPrevisaoMLCategoria(categoria, 6)
      setCategoriaDetalhe(data)
    } catch (err) {
      console.error('Erro ao carregar detalhes:', err)
    }
  }

  // Preparar dados do gráfico combinado
  function prepareChartData() {
    if (!categoriaDetalhe) return []
    
    const data = []
    
    // Adicionar histórico
    categoriaDetalhe.historico.forEach(h => {
      data.push({
        mes: h.ano_mes.slice(5),
        tipo: 'historico',
        historico: h.valor,
        label: h.ano_mes,
      })
    })
    
    // Adicionar previsões
    categoriaDetalhe.previsoes.forEach(p => {
      const mes = p.mes_referencia.slice(5, 7)
      data.push({
        mes: mes,
        tipo: 'previsao',
        previsao: parseFloat(p.valor_previsto),
        inferior: parseFloat(p.intervalo_inferior),
        superior: parseFloat(p.intervalo_superior),
        label: p.mes_referencia,
      })
    })
    
    return data
  }

  // Agrupar previsões por categoria
  function groupByCategoria() {
    const grouped = {}
    previsoes.forEach(p => {
      if (!grouped[p.categoria]) {
        grouped[p.categoria] = []
      }
      grouped[p.categoria].push(p)
    })
    return grouped
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Carregando previsões...</div>
      </div>
    )
  }

  const previsoesPorCategoria = groupByCategoria()
  const chartData = prepareChartData()

  return (
    <div className="p-8 space-y-8 h-full overflow-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Brain className="h-8 w-8 text-purple-500" />
            Previsão ML
            {resumo?.modelo_versao && (
              <Badge variant="secondary" className="text-xs font-mono">
                {resumo.modelo_versao.startsWith('v2') ? 'Transformer V2' : resumo.modelo_versao}
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground">
            Previsões de gastos geradas por Forecast Transformer com Query Tokens
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={fetchData}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </Button>
      </div>

      {error && (
        <Card className="border-yellow-500/50 bg-yellow-500/10">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-yellow-500 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-600">{error}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Para treinar o modelo, execute: 
                  <code className="ml-2 px-2 py-0.5 bg-muted rounded text-xs">
                    python temporal/start_forecast_workflow.py train --wait
                  </code>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cards de resumo */}
      {resumo && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Previsto</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(resumo.total_geral)}
              </div>
              <p className="text-xs text-muted-foreground">
                Próximos 3 meses
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Categorias</CardTitle>
              <Brain className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{resumo.n_categorias}</div>
              <p className="text-xs text-muted-foreground">
                Com previsões ativas
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Versão Modelo</CardTitle>
              <Calendar className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold font-mono">
                {resumo.modelo_versao?.startsWith('v2') ? 'V2 (Query Tokens)' : resumo.modelo_versao || '-'}
              </div>
              <p className="text-xs text-muted-foreground">
                Forecast Transformer
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Média Mensal</CardTitle>
              <TrendingDown className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(resumo.total_geral / 3)}
              </div>
              <p className="text-xs text-muted-foreground">
                Gasto previsto/mês
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Previsão por mês */}
      {resumo?.previsoes_por_mes?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Previsão de Gastos Totais</CardTitle>
            <CardDescription>
              Soma de todas as categorias por mês
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={resumo.previsoes_por_mes}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis 
                    dataKey="mes" 
                    tickFormatter={(v) => v?.slice(5, 7)}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar 
                    dataKey="total" 
                    fill="#22c55e" 
                    radius={[4, 4, 0, 0]}
                    name="Gasto Previsto"
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Lista de categorias e detalhe */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Lista de categorias */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Categorias</CardTitle>
            <CardDescription>Selecione para ver detalhes</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {Object.entries(previsoesPorCategoria).map(([categoria, prevs]) => {
                const total = prevs.reduce((sum, p) => sum + parseFloat(p.valor_previsto), 0)
                const isSelected = categoriaSelecionada === categoria
                
                return (
                  <button
                    key={categoria}
                    onClick={() => fetchCategoriaDetalhe(categoria)}
                    className={cn(
                      "w-full px-4 py-3 flex items-center justify-between",
                      "hover:bg-muted/50 transition-colors text-left",
                      isSelected && "bg-muted"
                    )}
                  >
                    <div>
                      <p className="font-medium">{categoria}</p>
                      <p className="text-sm text-muted-foreground">
                        {prevs.length} meses previstos
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-green-500">
                        {formatCurrency(total)}
                      </span>
                      <ChevronRight className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform",
                        isSelected && "rotate-90"
                      )} />
                    </div>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Detalhe da categoria */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>
              {categoriaDetalhe ? categoriaDetalhe.categoria : 'Selecione uma categoria'}
            </CardTitle>
            <CardDescription>
              {categoriaDetalhe 
                ? 'Histórico e previsão de gastos'
                : 'Clique em uma categoria para ver os detalhes'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {categoriaDetalhe ? (
              <ChartContainer config={chartConfig} className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis 
                      dataKey="mes" 
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
                      tickLine={false}
                      axisLine={false}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    
                    {/* Área de confiança para previsão */}
                    <Area
                      type="monotone"
                      dataKey="superior"
                      fill="#22c55e"
                      fillOpacity={0.1}
                      stroke="none"
                      name="Limite Superior"
                    />
                    <Area
                      type="monotone"
                      dataKey="inferior"
                      fill="#ffffff"
                      fillOpacity={1}
                      stroke="none"
                      name="Limite Inferior"
                    />
                    
                    {/* Linha do histórico */}
                    <Line
                      type="monotone"
                      dataKey="historico"
                      stroke={COLORS.historico}
                      strokeWidth={2}
                      dot={{ fill: COLORS.historico, r: 4 }}
                      name="Histórico"
                    />
                    
                    {/* Linha da previsão */}
                    <Line
                      type="monotone"
                      dataKey="previsao"
                      stroke={COLORS.previsao}
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={{ fill: COLORS.previsao, r: 4 }}
                      name="Previsão"
                    />
                    
                    <Legend />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartContainer>
            ) : (
              <div className="flex items-center justify-center h-[350px] text-muted-foreground">
                <div className="text-center">
                  <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Selecione uma categoria para visualizar</p>
                  <p className="text-sm">o histórico e as previsões</p>
                </div>
              </div>
            )}
          </CardContent>
          {categoriaDetalhe && (
            <CardFooter className="flex-col items-start gap-2 text-sm border-t pt-4">
              <div className="flex items-center gap-4 w-full">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.historico }} />
                  <span className="text-muted-foreground">Histórico</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.previsao }} />
                  <span className="text-muted-foreground">Previsão</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500" />
                  <span className="text-muted-foreground">Intervalo de Confiança (95%)</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Info className="h-4 w-4" />
                <span>
                  Total previsto para os próximos 3 meses: 
                  <strong className="text-foreground ml-1">
                    {formatCurrency(categoriaDetalhe.total_previsto)}
                  </strong>
                </span>
              </div>
            </CardFooter>
          )}
        </Card>
      </div>

      {/* Tabela de previsões detalhadas */}
      {previsoes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Detalhes das Previsões</CardTitle>
            <CardDescription>Todas as previsões por categoria e mês</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left text-sm font-medium">Categoria</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Mês</th>
                    <th className="px-4 py-3 text-right text-sm font-medium">Valor Previsto</th>
                    <th className="px-4 py-3 text-right text-sm font-medium">Intervalo</th>
                    <th className="px-4 py-3 text-center text-sm font-medium">Modelo</th>
                  </tr>
                </thead>
                <tbody>
                  {previsoes.slice(0, 20).map((p) => (
                    <tr key={p.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-3 text-sm font-medium">{p.categoria}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {p.mes_referencia}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono text-green-500">
                        {formatCurrency(p.valor_previsto)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-muted-foreground font-mono">
                        {p.intervalo_inferior && p.intervalo_superior ? (
                          `${formatCurrency(p.intervalo_inferior)} - ${formatCurrency(p.intervalo_superior)}`
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge 
                          variant={p.modelo_versao?.startsWith('v2') ? 'default' : 'outline'} 
                          className={`font-mono text-xs ${p.modelo_versao?.startsWith('v2') ? 'bg-purple-500' : ''}`}
                        >
                          {p.modelo_versao?.startsWith('v2') ? 'V2' : p.modelo_versao?.slice(0, 8) || '-'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {previsoes.length > 20 && (
              <p className="text-sm text-muted-foreground text-center mt-4">
                Mostrando 20 de {previsoes.length} previsões
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}


