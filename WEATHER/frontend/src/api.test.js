import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { api } from './api.js'
import { invalidateSession, supabase } from './auth.jsx'

vi.mock('./auth.jsx', () => ({ invalidateSession: vi.fn(), supabase: { auth: { getSession: vi.fn(), signOut: vi.fn() } } }))
beforeEach(() => {
  vi.clearAllMocks()
  supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'supabase-user-token' } } })
  supabase.auth.signOut.mockResolvedValue({ error: null })
})
afterEach(() => vi.unstubAllGlobals())

it('sends searches to FastAPI with a Supabase token, without contacting WeatherAPI', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'queued' }) })
  vi.stubGlobal('fetch', fetch)
  await api('/searches', { method: 'POST', body: { query: 'Paris' } })
  const [url, request] = fetch.mock.calls[0]
  expect(url).toBe('http://127.0.0.1:8000/api/v1/searches')
  expect(request.headers.Authorization).toBe('Bearer supabase-user-token')
  expect(request.body).toBe('{"query":"Paris"}')
  expect(url).not.toContain('weatherapi.com')
})

it('clears an invalid session while preserving the actual backend error', async () => {
  const detail = 'Supabase rechazó la sesión al consultar la base de datos.'
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401, json: async () => ({ detail }) }))
  await expect(api('/me/recent-locations')).rejects.toThrow(detail)
  expect(invalidateSession).toHaveBeenCalledWith(detail)
})

it('does not sign out a valid Google session for a backend configuration failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 503, ok: false, json: async () => ({ detail: 'Configuración del backend no válida.' }) }))
  await expect(api('/me/recent-locations')).rejects.toThrow('Configuración del backend no válida.')
  expect(invalidateSession).not.toHaveBeenCalled()
})
