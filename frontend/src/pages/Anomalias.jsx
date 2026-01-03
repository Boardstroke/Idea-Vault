import { useState, useEffect } from 'react'
import { AlertTriangle, AlertCircle, Info, TrendingUp } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '../components/ui/chart'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Badge } from '../components/ui/badge'
import { api } from '../lib/api'
import { formatCurrency, formatDate } from '../lib/utils'

const severidadeConfig = {
  alta: { color: '#ef4444', icon: AlertTriangle, label: 'Alta' },
  media: { color: '#f59e0b', icon: AlertCircle, label: 'Média' },
  baixa: { color: '#3b82f6', icon: Info, label: 'Baixa' },
}

export default function Anomalias() {
  const [anomalias, setAnomalias] = useState([])
  const [resumo, setResumo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filtroSeveridade, setFiltroSeveridade] = useState('todas')

  useEffect(() => {
    async function fetchData() {
      try {
        const [anomaliasData, resumoData] = await Promise.all([
          api.getAnomalias(),
          api.getAnomaliasResumo(),
        ])
        setAnomalias(anomaliasData)
        setResumo(resumoData)
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

  const anomaliasFiltradas = filtroSeveridade === 'todas'
    ? anomalias
    : anomalias.filter(a => a.severidade === filtroSeveridade)

  const chartData = [
    { name: 'Alta', value: resumo?.anomalias_alta || 0, fill: '#ef4444' },
    { name: 'Média', value: resumo?.anomalias_media || 0, fill: '#f59e0b' },
    { name: 'Baixa', value: resumo?.anomalias_baixa || 0, fill: '#3b82f6' },
  ]

  return (
    <div className="p-8 space-y-8 h-full overflow-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Anomalias</h1>
        <p className="text-muted-foreground">Transações suspeitas detectadas pelo sistema</p>
      </div>

      {/* Cards de resumo */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total de Anomalias</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resumo?.total_anomalias}</div>
            <p className="text-xs text-muted-foreground">
              transações suspeitas
            </p>
          </CardContent>
        </Card>

        <Card className="border-red-500/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Alta Severidade
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{resumo?.anomalias_alta}</div>
            <p className="text-xs text-muted-foreground">requerem atenção</p>
          </CardContent>
        </Card>

        <Card className="border-yellow-500/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-500" />
              Média Severidade
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">{resumo?.anomalias_media}</div>
            <p className="text-xs text-muted-foreground">para análise</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {resumo && formatCurrency(resumo.valor_total_anomalias)}
            </div>
            <p className="text-xs text-muted-foreground">em transações anômalas</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de distribuição */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Distribuição por Severidade</CardTitle>
            <CardDescription>Quantidade de anomalias por nível</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{}} className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                  <Bar dataKey="value" radius={4}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Como funciona a detecção</CardTitle>
            <CardDescription>Critérios utilizados para identificar anomalias</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <TrendingUp className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">Valor acima de 2 desvios padrão</p>
                <p className="text-sm text-muted-foreground">Transação muito acima da média da categoria</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <TrendingUp className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">Acima do percentil 95</p>
                <p className="text-sm text-muted-foreground">Valor entre os 5% maiores da categoria</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <TrendingUp className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">3x acima da média</p>
                <p className="text-sm text-muted-foreground">Valor três vezes maior que a média</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <TrendingUp className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">Primeiro gasto alto</p>
                <p className="text-sm text-muted-foreground">Primeira transação em novo estabelecimento com valor alto</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de anomalias */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Transações Anômalas</CardTitle>
              <CardDescription>Lista de transações suspeitas detectadas</CardDescription>
            </div>
            <select
              value={filtroSeveridade}
              onChange={(e) => setFiltroSeveridade(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="todas">Todas</option>
              <option value="alta">Alta severidade</option>
              <option value="media">Média severidade</option>
              <option value="baixa">Baixa severidade</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Média Cat.</TableHead>
                <TableHead className="text-center">Score</TableHead>
                <TableHead className="text-center">Severidade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {anomaliasFiltradas.map((anomalia) => {
                const config = severidadeConfig[anomalia.severidade]
                const Icon = config?.icon || Info
                
                return (
                  <TableRow key={anomalia.transaction_id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(anomalia.data_transacao)}
                    </TableCell>
                    <TableCell className="max-w-[250px] truncate">
                      {anomalia.descricao_original}
                    </TableCell>
                    <TableCell>{anomalia.categoria_nome}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(anomalia.valor)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {anomalia.media_categoria ? formatCurrency(anomalia.media_categoria) : '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">{anomalia.anomaly_score}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge 
                        variant={anomalia.severidade === 'alta' ? 'destructive' : anomalia.severidade === 'media' ? 'warning' : 'secondary'}
                        className="gap-1"
                      >
                        <Icon className="h-3 w-3" />
                        {config?.label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}


