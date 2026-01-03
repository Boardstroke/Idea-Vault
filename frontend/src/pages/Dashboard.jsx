import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, CreditCard, AlertTriangle, Calendar } from 'lucide-react'
import { BarChart, Bar, XAxis, CartesianGrid, RadialBarChart, RadialBar, LabelList, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '../components/ui/chart'
import { Badge } from '../components/ui/badge'
import { api } from '../lib/api'
import { formatCurrency } from '../lib/utils'

const balancoChartConfig = {
  entradas: {
    label: "Entradas",
    color: "hsl(142 76% 36%)", // Verde
  },
  saidas: {
    label: "Saídas", 
    color: "hsl(0 72% 51%)", // Vermelho
  },
}

export default function Dashboard() {
  const [balanco, setBalanco] = useState([])
  const [resumo, setResumo] = useState(null)
  const [categorias, setCategorias] = useState([])
  const [assinaturasResumo, setAssinaturasResumo] = useState(null)
  const [parcelasResumo, setParcelasResumo] = useState(null)
  const [anomaliasResumo, setAnomaliasResumo] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const [balancoData, resumoData, categoriasData, assData, parcData, anomData] = await Promise.all([
          api.getBalanco(),
          api.getBalancoResumo(),
          api.getCategoriasResumo(),
          api.getAssinaturasResumo(),
          api.getParcelasResumo(),
          api.getAnomaliasResumo(),
        ])
        setBalanco(balancoData)
        setResumo(resumoData)
        setCategorias(categoriasData)
        setAssinaturasResumo(assData)
        setParcelasResumo(parcData)
        setAnomaliasResumo(anomData)
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

  const chartData = balanco.map(b => ({
    mes: b.ano_mes.slice(5),
    entradas: parseFloat(b.total_entradas),
    saidas: parseFloat(b.total_saidas),
  }))

  // Dados para o RadialBarChart (top 5 categorias)
  const radialData = categorias.slice(0, 5).map((c, i) => ({
    categoria: c.categoria_nome.length > 12 ? c.categoria_nome.slice(0, 12) + '...' : c.categoria_nome,
    total: parseFloat(c.total_gasto),
    fill: `var(--color-cat${i + 1})`,
  }))

  const categoriaChartConfig = {
    total: { label: "Total Gasto" },
    ...categorias.slice(0, 5).reduce((acc, c, i) => {
      acc[`cat${i + 1}`] = {
        label: c.categoria_nome,
        color: `hsl(var(--chart-${i + 1}))`,
      }
      return acc
    }, {}),
  }

  const totalCategorias = categorias.reduce((sum, c) => sum + parseFloat(c.total_gasto), 0)

  return (
    <div className="p-8 space-y-8 h-full overflow-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral das suas finanças</p>
      </div>

      {/* Cards de métricas */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Entradas</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {resumo && formatCurrency(resumo.total_entradas)}
            </div>
            <p className="text-xs text-muted-foreground">
              Média mensal: {resumo && formatCurrency(resumo.media_mensal_entradas)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Saídas</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">
              {resumo && formatCurrency(resumo.total_saidas)}
            </div>
            <p className="text-xs text-muted-foreground">
              Média mensal: {resumo && formatCurrency(resumo.media_mensal_saidas)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Assinaturas</CardTitle>
            <CreditCard className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {assinaturasResumo && formatCurrency(assinaturasResumo.custo_mensal_total)}
            </div>
            <p className="text-xs text-muted-foreground">
              {assinaturasResumo?.assinaturas_ativas} assinaturas ativas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Parcelas Restantes</CardTitle>
            <Calendar className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">
              {parcelasResumo && formatCurrency(parcelasResumo.total_valor_restante)}
            </div>
            <p className="text-xs text-muted-foreground">
              {parcelasResumo?.compras_em_andamento} compras em andamento
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Balanço Mensal</CardTitle>
            <CardDescription>Entradas vs Saídas - 2025</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={balancoChartConfig} className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart accessibilityLayer data={chartData}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="mes"
                    tickLine={false}
                    tickMargin={10}
                    axisLine={false}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent indicator="dashed" />}
                  />
                  <Bar dataKey="entradas" fill="var(--color-entradas)" radius={4} />
                  <Bar dataKey="saidas" fill="var(--color-saidas)" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
          <CardFooter className="flex-col items-start gap-2 text-sm">
            <div className="flex gap-2 font-medium leading-none">
              {resumo?.meses_superavit} meses em superávit <TrendingUp className="h-4 w-4" />
            </div>
            <div className="leading-none text-muted-foreground">
              Saldo total: {resumo && formatCurrency(resumo.saldo_total)}
            </div>
          </CardFooter>
        </Card>

        <Card className="flex flex-col">
          <CardHeader className="items-center pb-0">
            <CardTitle>Gastos por Categoria</CardTitle>
            <CardDescription>Distribuição dos gastos totais</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 pb-0">
            <ChartContainer config={categoriaChartConfig} className="mx-auto aspect-square h-[280px]">
              <RadialBarChart
                data={radialData}
                startAngle={-90}
                endAngle={380}
                innerRadius={30}
                outerRadius={110}
                width={280}
                height={280}
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
                    fontSize={10}
                  />
                </RadialBar>
              </RadialBarChart>
            </ChartContainer>
          </CardContent>
          <CardFooter className="flex-col gap-2 text-sm">
            <div className="flex items-center gap-2 font-medium leading-none">
              Total: {formatCurrency(totalCategorias)}
            </div>
            <div className="leading-none text-muted-foreground">
              Top 5 categorias de gasto
            </div>
          </CardFooter>
        </Card>
      </div>

      {/* Status e Alertas */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Status do Ano</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Meses em superávit</span>
              <Badge variant="success">{resumo?.meses_superavit}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Meses em déficit</span>
              <Badge variant="destructive">{resumo?.meses_deficit}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Saldo total</span>
              <span className={`font-bold ${parseFloat(resumo?.saldo_total) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {resumo && formatCurrency(resumo.saldo_total)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Anomalias Detectadas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Alta severidade</span>
              <Badge variant="destructive">{anomaliasResumo?.anomalias_alta}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Média severidade</span>
              <Badge variant="warning">{anomaliasResumo?.anomalias_media}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-bold">{anomaliasResumo?.total_anomalias}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Próximo Mês</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Assinaturas</span>
              <span className="font-medium">{assinaturasResumo && formatCurrency(assinaturasResumo.custo_mensal_total)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Parcelas</span>
              <span className="font-medium">{parcelasResumo && formatCurrency(parcelasResumo.proximas_parcelas_valor)}</span>
            </div>
            <div className="flex items-center justify-between border-t pt-4">
              <span className="text-muted-foreground">Gastos fixos</span>
              <span className="font-bold text-orange-500">
                {assinaturasResumo && parcelasResumo && formatCurrency(
                  parseFloat(assinaturasResumo.custo_mensal_total) + 
                  parseFloat(parcelasResumo.proximas_parcelas_valor)
                )}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
