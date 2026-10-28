import { invalidateSession, supabase } from '../auth.jsx'

const base = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8001').replace(/\/$/, '')

export async function api(path, { method = 'GET', signal } = {}) {
  const sessionResult = await supabase?.auth.getSession()
  const session = sessionResult?.data?.session
  if (!session) throw new Error('Inicia sesión para explorar el catálogo.')
  let response
  try {
    response = await fetch(`${base}/api/v1${path}`, { method, signal,
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new Error('No se pudo conectar con el servicio. Comprueba que FastAPI esté en ejecución.')
  }
  const result = await response.json().catch(() => ({}))
  if (response.status === 401) {
    const message = typeof result.detail === 'string' ? result.detail : 'Tu sesión ha expirado. Inicia sesión de nuevo.'
    await invalidateSession(message)
    throw new Error(message)
  }
  if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'No se pudo completar la consulta. Intenta de nuevo.')
  return result
}
