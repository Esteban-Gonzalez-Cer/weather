import { invalidateSession, supabase } from './auth.jsx'

const base = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

export class PendingJob extends Error {
  constructor(id) { super('La carga sigue pendiente. Comprueba que Airflow esté en ejecución y vuelve a consultar.'); this.jobId = id }
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Inicia sesión para consultar el clima.')
  let response
  try {
    response = await fetch(`${base}/api/v1${path}`, { method, signal,
      headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new Error('No se pudo conectar con el servicio. Comprueba que FastAPI esté en ejecución.')
  }
  const result = await response.json().catch(() => ({}))
  if (response.status === 401) {
    const message = typeof result.detail === 'string' ? result.detail : 'Tu sesión no es válida. Inicia sesión de nuevo.'
    await invalidateSession(message)
    throw new Error(message)
  }
  if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'No se pudo completar la solicitud. Intenta de nuevo.')
  return result
}

function delay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new DOMException('Aborted', 'AbortError')) }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve() }, milliseconds)
    if (signal?.aborted) abort()
    else signal?.addEventListener('abort', abort, { once: true })
  })
}

export async function waitForJob(id, signal, onProgress = () => {}) {
  const started = Date.now()
  while (!signal.aborted && Date.now() - started < 180_000) {
    const job = await api(`/jobs/${id}`, { signal })
    if (job.status === 'completed') return job
    if (job.status === 'failed') throw new Error(job.error || 'La carga no se pudo completar. Vuelve a intentarlo.')
    onProgress(job.status)
    await delay(5000, signal)
  }
  if (!signal.aborted) throw new PendingJob(id)
  throw new DOMException('Aborted', 'AbortError')
}
