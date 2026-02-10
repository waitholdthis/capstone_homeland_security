import { Routes, Route } from 'react-router-dom'
import { IncidentProvider } from './context/IncidentContext'
import Layout from './components/layout/Layout'
import DashboardPage from './pages/DashboardPage'
import NewIncidentPage from './pages/NewIncidentPage'
import ConsolePage from './pages/ConsolePage'
import ReviewPage from './pages/ReviewPage'
import DoctrinePage from './pages/DoctrinePage'

export default function App() {
  return (
    <IncidentProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/incident/new" element={<NewIncidentPage />} />
          <Route path="/console/:id" element={<ConsolePage />} />
          <Route path="/review/:id" element={<ReviewPage />} />
          <Route path="/doctrine" element={<DoctrinePage />} />
        </Routes>
      </Layout>
    </IncidentProvider>
  )
}
