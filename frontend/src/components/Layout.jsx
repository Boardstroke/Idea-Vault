import { NavLink, Outlet } from 'react-router-dom'
import { useState } from 'react'
import { 
  LayoutDashboard, 
  PieChart, 
  CreditCard, 
  Calendar, 
  AlertTriangle,
  TrendingUp,
  Wallet,
  List,
  Brain,
  Table2,
  Search,
  ChevronLeft,
  Link2,
  FolderTree,
  Database,
  Plus
} from 'lucide-react'
import { cn } from '../lib/utils'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Transações', href: '/transacoes', icon: List },
  { name: 'Categorias', href: '/categorias', icon: PieChart },
  { name: 'Modelos', href: '/orcamento', icon: Table2 },
  { name: 'Assinaturas', href: '/assinaturas', icon: CreditCard },
  { name: 'Parcelas', href: '/parcelas', icon: Calendar },
  { name: 'Anomalias', href: '/anomalias', icon: AlertTriangle },
  { name: 'Previsão ML', href: '/previsao-ml', icon: Brain },
  { name: 'Datasources', href: '/datasources', icon: Database },
]

export default function Layout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className={cn(
        "flex-shrink-0 border-r bg-card flex flex-col transition-all duration-200",
        sidebarCollapsed ? "w-16" : "w-56"
      )}>
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-3 border-b">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" />
              <span className="font-semibold">Finanças</span>
            </div>
          )}
          {sidebarCollapsed && (
            <Wallet className="w-5 h-5 text-primary mx-auto" />
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={cn(
              "p-1.5 rounded hover:bg-muted transition-colors",
              sidebarCollapsed && "mx-auto mt-2"
            )}
          >
            <ChevronLeft className={cn(
              "w-4 h-4 transition-transform",
              sidebarCollapsed && "rotate-180"
            )} />
          </button>
        </div>
        
        {/* Search */}
        {!sidebarCollapsed && (
          <div className="p-3 border-b">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg text-sm text-muted-foreground">
              <Search className="w-4 h-4" />
              <span>Search</span>
              <span className="ml-auto text-xs opacity-60">⌘K</span>
            </div>
          </div>
        )}
        
        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  sidebarCollapsed && "justify-center px-2",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )
              }
              title={sidebarCollapsed ? item.name : undefined}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {!sidebarCollapsed && <span>{item.name}</span>}
            </NavLink>
          ))}
        </nav>
        
        {/* Footer */}
        <div className="p-3 border-t">
          {!sidebarCollapsed ? (
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <TrendingUp className="w-4 h-4 text-primary" />
                Dados Nubank
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Pipeline dbt atualizado
              </p>
            </div>
          ) : (
            <div className="flex justify-center">
              <TrendingUp className="w-4 h-4 text-primary" />
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
