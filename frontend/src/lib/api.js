const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function getToken() {
  return localStorage.getItem('access_token')
}

function handleUnauthorized() {
  localStorage.clear()
  window.location.href = '/login'
}

/**
 * Authenticated fetch — auto-injects Bearer token, redirects to /login on 401.
 */
export async function authFetch(path, options = {}) {
  const token = getToken()
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  }
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })

  if (res.status === 401) {
    handleUnauthorized()
    return
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

// ── Auth ───────────────────────────────────────────────────────────────────────

export async function login(googleToken) {
  const res = await fetch(`${BASE_URL}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: googleToken }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail || 'Login failed')
  }
  return res.json()
}

// ── Users ──────────────────────────────────────────────────────────────────────

export function getUser(userId) {
  return authFetch(`/users/${userId}`)
}

export function updateUser(userId, data) {
  return authFetch(`/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

// payload is either { resume_pdf: base64, filename } or { resume_text: text }
export function parseResume(userId, payload) {
  return authFetch('/users/parse-resume', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, ...payload }),
  })
}

// ── Jobs ───────────────────────────────────────────────────────────────────────

export function getJobs(filters = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => {
    if (v != null && v !== '') params.set(k, v)
  })
  return authFetch(`/jobs?${params}`)
}

export function scrapeJobs(userId) {
  return authFetch('/jobs/scrape', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  })
}

export function updateJobStatus(id, status) {
  return authFetch(`/jobs/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  })
}
