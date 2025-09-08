import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { SplashPage } from '@/components/splash/SplashPage'
import { NuovaPraticaPage } from '@/components/pages/NuovaPraticaPage'
import { PraticaCanvasPage } from '@/components/pages/PraticaCanvasPage'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<SplashPage />} />
          <Route path="nuova-pratica" element={<NuovaPraticaPage />} />
          <Route path="pratica/:id" element={<PraticaCanvasPage />} />
        </Route>
      </Routes>
    </Router>
  )
}

export default App