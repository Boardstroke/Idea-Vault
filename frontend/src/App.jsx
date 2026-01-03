import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Categorias from './pages/Categorias'
import Assinaturas from './pages/Assinaturas'
import Parcelas from './pages/Parcelas'
import Anomalias from './pages/Anomalias'
import Transacoes from './pages/Transacoes'
import PrevisaoML from './pages/PrevisaoML'
import Orcamento from './pages/Orcamento'
import Datasources from './pages/Datasources'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="transacoes" element={<Transacoes />} />
          <Route path="categorias" element={<Categorias />} />
          <Route path="orcamento" element={<Orcamento />} />
          <Route path="assinaturas" element={<Assinaturas />} />
          <Route path="parcelas" element={<Parcelas />} />
          <Route path="anomalias" element={<Anomalias />} />
          <Route path="previsao-ml" element={<PrevisaoML />} />
          <Route path="datasources" element={<Datasources />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
