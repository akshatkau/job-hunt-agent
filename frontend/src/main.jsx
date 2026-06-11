import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import './index.css'

function RequireAuth({ children }) {
  const token = localStorage.getItem('access_token')
  const hasResume = localStorage.getItem('has_resume')

  if (!token) return <Navigate to="/login" replace />
  if (!hasResume) return <Navigate to="/onboarding" replace />
  return children
}

function RequireNoAuth({ children }) {
  const token = localStorage.getItem('access_token')
  if (!token) return children
  const hasResume = localStorage.getItem('has_resume')
  return hasResume ? <Navigate to="/dashboard" replace /> : <Navigate to="/onboarding" replace />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={<RequireNoAuth><Login /></RequireNoAuth>}
        />
        <Route
          path="/onboarding"
          element={
            (() => {
              const token = localStorage.getItem('access_token')
              if (!token) return <Navigate to="/login" replace />
              return <Onboarding />
            })()
          }
        />
        <Route
          path="/dashboard"
          element={<RequireAuth><Dashboard /></RequireAuth>}
        />
        <Route
          path="/"
          element={
            (() => {
              const token = localStorage.getItem('access_token')
              if (!token) return <Navigate to="/login" replace />
              const hasResume = localStorage.getItem('has_resume')
              return hasResume
                ? <Navigate to="/dashboard" replace />
                : <Navigate to="/onboarding" replace />
            })()
          }
        />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
