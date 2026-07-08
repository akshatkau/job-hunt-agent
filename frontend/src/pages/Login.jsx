import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../lib/api'

export default function Login() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = initGoogle
    document.head.appendChild(script)
    return () => document.head.removeChild(script)
  }, [])

  function initGoogle() {
    window.google.accounts.id.initialize({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
      ux_mode: 'popup',
      use_fedcm_for_prompt: false,
    })
    window.google.accounts.id.renderButton(
      document.getElementById('google-signin-btn'),
      {
        theme: 'outline',
        size: 'large',
        width: 300,
        text: 'signin_with',
        shape: 'rectangular',
      }
    )
  }

  async function handleCredentialResponse(response) {
    setLoading(true)
    setError('')
    try {
      const data = await login(response.credential)
      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('user_id', data.user_id)
      localStorage.setItem('user_name', data.name)
      localStorage.setItem('user_email', data.email)
      localStorage.setItem('user_picture', data.picture)
      localStorage.setItem('login_at', Date.now().toString())
      window.google.accounts.id.disableAutoSelect()
      if (data.resume_text) {
        localStorage.setItem('has_resume', '1')
        navigate('/dashboard', { replace: true })
      } else {
        navigate('/onboarding', { replace: true })
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md text-center">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Job Hunt Agent</h1>
          <p className="text-gray-500">AI-powered job discovery across all platforms</p>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-gray-600">Sign in to start finding jobs</p>

          {loading ? (
            <div className="flex justify-center items-center gap-2 text-gray-500">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              Signing in...
            </div>
          ) : (
            <div id="google-signin-btn" className="flex justify-center" />
          )}

          {error && (
            <p className="text-red-500 text-sm bg-red-50 rounded-lg px-4 py-2">{error}</p>
          )}
        </div>

        <p className="mt-8 text-xs text-gray-400">
          Your data is private and secure
        </p>
      </div>
    </div>
  )
}
