import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { RadialBarChart, RadialBar, LabelList } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '../components/ui/chart'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Badge } from '../components/ui/badge'
import { api } from '../lib/api'
import { formatCurrency, formatPercent } from '../lib/utils'

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
]

export default function Categorias() {
  const [categorias, setCategorias] = useState([])
  const [resumo, setResumo] = useState([])
  const [loading, setLoading] = useState(true)
  const [mesSelecionado, setMesSelecionado] = useState(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const [categoriasData, resumoData] = await Promise.all([
          api.getCategorias(),
          api.getCategoriasResumo(),
        ])
        setCategorias(categoriasData)
        setResumo(resumoData)
        
        // Pegar meses únicos
        const meses = [...new Set(categoriasData.map(c => c.ano_mes))].sort().reverse()
        if (meses.length > 0) {
          setMesSelecionado(meses[0])
        }
      } catch (error) {
        console.error('Erro ao carregar dados:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    )
  }

  const meses = [...new Set(categorias.map(c => c.ano_mes))].sort().reverse()
  const categoriasMes = categorias.filter(c => c.ano_mes === mesSelecionado)

  // Preparar dados para o RadialBarChart (top 5 para melhor visualização)
  const chartData = resumo.slice(0, 5).map((c, i) => ({
    categoria: c.categoria_nome.length > 15 ? c.categoria_nome.slice(0, 15) + '...' : c.categoria_nome,
    total: parseFloat(c.total_gasto),
    fill: `var(--color-cat${i + 1})`,
  }))

  // Calcular total geral para o footer
  const totalGeral = resumo.reduce((sum, c) => sum + parseFloat(c.total_gasto), 0)

  const chartConfig = {
    total: { label: "Total Gasto" },
    ...resumo.slice(0, 5).reduce((acc, c, i) => {
      acc[`cat${i + 1}`] = {
        label: c.categoria_nome,
        color: `hsl(var(--chart-${i + 1}))`,
      }
      return acc
    }, {}),
  }

  return (
    <div className="p-8 space-y-8 h-full overflow-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Categorias</h1>
        <p className="text-muted-foreground">Análise de gastos por categoria</p>
      </div>

      {/* Gráfico radial de categorias */}
      <Card className="flex flex-col">
        <CardHeader className="items-center pb-0">
          <CardTitle>Top 5 Categorias</CardTitle>
          <CardDescription>Gastos totais acumulados no período</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 pb-0">
          <ChartContainer
            config={chartConfig}
            className="mx-auto aspect-square h-[350px]"
          >
            <RadialBarChart
              data={chartData}
              startAngle={-90}
              endAngle={380}
              innerRadius={30}
              outerRadius={140}
              width={350}
              height={350}
            >
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel nameKey="categoria" />}
              />
              <RadialBar dataKey="total" background>
                <LabelList
                  position="insideStart"
                  dataKey="categoria"
                  className="fill-white capitalize mix-blend-luminosity"
                  fontSize={11}
                />
              </RadialBar>
            </RadialBarChart>
          </ChartContainer>
        </CardContent>
        <CardFooter className="flex-col gap-2 text-sm">
          <div className="flex items-center gap-2 font-medium leading-none">
            Total acumulado: {formatCurrency(totalGeral)}
          </div>
          <div className="leading-none text-muted-foreground">
            Mostrando as 5 maiores categorias de gasto
          </div>
        </CardFooter>
      </Card>

      {/* Seletor de mês e tabela */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Detalhamento Mensal</CardTitle>
              <CardDescription>Gastos por categoria no mês selecionado</CardDescription>
            </div>
            <select 
              value={mesSelecionado || ''}
              onChange={(e) => setMesSelecionado(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              {meses.map(mes => (
                <option key={mes} value={mes}>{mes}</option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Total Gasto</TableHead>
                <TableHead className="text-right">Transações</TableHead>
                <TableHead className="text-right">Ticket Médio</TableHead>
                <TableHead className="text-right">% do Total</TableHead>
                <TableHead className="text-center">Tendência</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categoriasMes.map((cat, index) => (
                <TableRow key={`${cat.categoria_id}-${cat.ano_mes}`}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <div 
                        className="h-3 w-3 rounded-sm" 
                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                      />
                      {cat.categoria_nome}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(cat.total_gasto)}
                  </TableCell>
                  <TableCell className="text-right">{cat.qtd_transacoes}</TableCell>
                  <TableCell className="text-right">{formatCurrency(cat.ticket_medio)}</TableCell>
                  <TableCell className="text-right">{cat.percentual_do_total}%</TableCell>
                  <TableCell className="text-center">
                    {cat.tendencia === 'aumentando' && (
                      <Badge variant="destructive" className="gap-1">
                        <TrendingUp className="h-3 w-3" /> Alta
                      </Badge>
                    )}
                    {cat.tendencia === 'diminuindo' && (
                      <Badge variant="success" className="gap-1">
                        <TrendingDown className="h-3 w-3" /> Baixa
                      </Badge>
                    )}
                    {cat.tendencia === 'estavel' && (
                      <Badge variant="secondary">Estável</Badge>
                    )}
                    {cat.tendencia === 'primeiro_registro' && (
                      <Badge variant="outline">Novo</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}


