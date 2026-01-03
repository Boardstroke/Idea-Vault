import { useState, useEffect } from 'react'
import { Calendar, CheckCircle, Clock, TrendingDown } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Badge } from '../components/ui/badge'
import { Progress } from '../components/ui/progress'
import { api } from '../lib/api'
import { formatCurrency, formatDate } from '../lib/utils'

export default function Parcelas() {
  const [parcelas, setParcelas] = useState([])
  const [resumo, setResumo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState('todas')

  useEffect(() => {
    async function fetchData() {
      try {
        const [parcelasData, resumoData] = await Promise.all([
          api.getParcelas(),
          api.getParcelasResumo(),
        ])
        setParcelas(parcelasData)
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

  const parcelasFiltradas = filtroStatus === 'todas'
    ? parcelas
    : parcelas.filter(p => p.status_compra === filtroStatus)

  return (
    <div className="p-8 space-y-8 h-full overflow-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Parcelas</h1>
        <p className="text-muted-foreground">Acompanhe suas compras parceladas</p>
      </div>

      {/* Cards de resumo */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total de Compras</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resumo?.total_compras_parceladas}</div>
            <p className="text-xs text-muted-foreground">
              parceladas no período
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Em Andamento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{resumo?.compras_em_andamento}</div>
            <p className="text-xs text-muted-foreground">compras ativas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Valor Restante</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">
              {resumo && formatCurrency(resumo.total_valor_restante)}
            </div>
            <p className="text-xs text-muted-foreground">a pagar</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Próximas Parcelas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {resumo && formatCurrency(resumo.proximas_parcelas_valor)}
            </div>
            <p className="text-xs text-muted-foreground">no próximo mês</p>
          </CardContent>
        </Card>
      </div>

      {/* Cards de parcelas em destaque */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {parcelas.filter(p => p.status_compra === 'em_andamento').slice(0, 6).map((parcela) => {
          const progresso = (parcela.parcelas_pagas / parcela.total_parcelas) * 100
          
          return (
            <Card key={parcela.compra_id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base truncate pr-4">
                    {parcela.estabelecimento}
                  </CardTitle>
                  <Badge variant="outline">
                    {parcela.parcelas_pagas}/{parcela.total_parcelas}
                  </Badge>
                </div>
                <CardDescription>{parcela.categoria_nome}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Progresso</span>
                    <span className="font-medium">{progresso.toFixed(0)}%</span>
                  </div>
                  <Progress value={progresso} className="h-2" />
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Parcela</p>
                    <p className="font-medium">{formatCurrency(parcela.valor_parcela)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Restante</p>
                    <p className="font-medium text-red-500">{formatCurrency(parcela.valor_restante)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
                  <Calendar className="h-3 w-3" />
                  Término: {parcela.mes_fim_previsto}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Tabela completa */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Todas as Parcelas</CardTitle>
              <CardDescription>Histórico completo de compras parceladas</CardDescription>
            </div>
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="todas">Todas</option>
              <option value="em_andamento">Em andamento</option>
              <option value="quitada">Quitadas</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Estabelecimento</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-center">Progresso</TableHead>
                <TableHead className="text-right">Parcela</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Restante</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parcelasFiltradas.map((parcela) => (
                <TableRow key={parcela.compra_id}>
                  <TableCell className="font-medium max-w-[200px] truncate">
                    {parcela.estabelecimento}
                  </TableCell>
                  <TableCell>{parcela.categoria_nome}</TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Progress 
                        value={(parcela.parcelas_pagas / parcela.total_parcelas) * 100} 
                        className="w-16 h-2" 
                      />
                      <span className="text-xs text-muted-foreground">
                        {parcela.parcelas_pagas}/{parcela.total_parcelas}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(parcela.valor_parcela)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(parcela.valor_total_compra)}</TableCell>
                  <TableCell className="text-right font-medium">
                    {parcela.status_compra === 'quitada' ? (
                      <span className="text-green-500">—</span>
                    ) : (
                      <span className="text-red-500">{formatCurrency(parcela.valor_restante)}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {parcela.status_compra === 'quitada' ? (
                      <Badge variant="success" className="gap-1">
                        <CheckCircle className="h-3 w-3" /> Quitada
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1">
                        <Clock className="h-3 w-3" /> Em andamento
                      </Badge>
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


