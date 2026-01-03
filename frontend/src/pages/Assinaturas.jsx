import { useState, useEffect } from 'react'
import { CreditCard, Globe, MapPin, CheckCircle, XCircle, Clock } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '../components/ui/chart'
import { Badge } from '../components/ui/badge'
import { api } from '../lib/api'
import { formatCurrency, formatDate } from '../lib/utils'

const tipoIcons = {
  streaming_video: '🎬',
  streaming_audio: '🎵',
  ferramentas_dev: '💻',
  armazenamento: '☁️',
  telecom: '📱',
  seguro: '🛡️',
  beneficios: '🎁',
  outros: '📦',
}

export default function Assinaturas() {
  const [assinaturas, setAssinaturas] = useState([])
  const [resumo, setResumo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState('todas')

  useEffect(() => {
    async function fetchData() {
      try {
        const [assinaturasData, resumoData] = await Promise.all([
          api.getAssinaturas(),
          api.getAssinaturasResumo(),
        ])
        setAssinaturas(assinaturasData)
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

  const assinaturasFiltradas = filtroStatus === 'todas' 
    ? assinaturas 
    : assinaturas.filter(a => a.status === filtroStatus)

  const chartData = Object.entries(resumo?.por_tipo || {}).map(([tipo, valor]) => ({
    name: tipo.replace(/_/g, ' '),
    total: valor,
  })).sort((a, b) => b.total - a.total)

  return (
    <div className="p-8 space-y-8 h-full overflow-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Assinaturas</h1>
        <p className="text-muted-foreground">Gerencie seus serviços recorrentes</p>
      </div>

      {/* Cards de resumo */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total de Assinaturas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resumo?.total_assinaturas}</div>
            <p className="text-xs text-muted-foreground">
              {resumo?.assinaturas_ativas} ativas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Custo Mensal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {resumo && formatCurrency(resumo.custo_mensal_total)}
            </div>
            <p className="text-xs text-muted-foreground">assinaturas ativas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Custo Anual</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">
              {resumo && formatCurrency(resumo.custo_anual_total)}
            </div>
            <p className="text-xs text-muted-foreground">projeção anual</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Por Tipo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Object.keys(resumo?.por_tipo || {}).length}</div>
            <p className="text-xs text-muted-foreground">categorias diferentes</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico por tipo */}
      <Card>
        <CardHeader>
          <CardTitle>Custo por Tipo de Serviço</CardTitle>
          <CardDescription>Distribuição dos gastos com assinaturas</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={{}} className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 40 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <YAxis
                  dataKey="name"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  width={120}
                  tick={{ fontSize: 12 }}
                />
                <XAxis type="number" tickLine={false} axisLine={false} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Lista de assinaturas */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Todas as Assinaturas</CardTitle>
              <CardDescription>Lista completa de serviços recorrentes</CardDescription>
            </div>
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="todas">Todas</option>
              <option value="ativa">Ativas</option>
              <option value="inativa_recente">Inativas recentes</option>
              <option value="cancelada">Canceladas</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {assinaturasFiltradas.map((assinatura) => (
              <Card key={assinatura.assinatura_id} className="relative overflow-hidden">
                <div className={`absolute top-0 left-0 right-0 h-1 ${
                  assinatura.status === 'ativa' ? 'bg-green-500' : 
                  assinatura.status === 'inativa_recente' ? 'bg-yellow-500' : 'bg-red-500'
                }`} />
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <span>{tipoIcons[assinatura.tipo_servico] || '📦'}</span>
                      {assinatura.servico_nome}
                    </CardTitle>
                    {assinatura.status === 'ativa' ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : assinatura.status === 'inativa_recente' ? (
                      <Clock className="h-4 w-4 text-yellow-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                  <CardDescription className="flex items-center gap-1">
                    {assinatura.origem === 'internacional' ? (
                      <><Globe className="h-3 w-3" /> Internacional</>
                    ) : (
                      <><MapPin className="h-3 w-3" /> Nacional</>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Valor mensal</span>
                    <span className="font-bold">{formatCurrency(assinatura.valor_mensal)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Custo anual</span>
                    <span className="text-sm">{formatCurrency(assinatura.custo_anual_estimado)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Cobranças</span>
                    <span className="text-sm">{assinatura.meses_cobranca} meses</span>
                  </div>
                  <div className="pt-2 border-t">
                    <Badge variant={assinatura.tipo_cobranca === 'fixa' ? 'default' : 'secondary'}>
                      {assinatura.tipo_cobranca}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}


