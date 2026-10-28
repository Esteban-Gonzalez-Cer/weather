import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { api } from './api.js'
import { invalidateSession, supabase } from '../auth.jsx'

vi.mock('../auth.jsx', () => ({ invalidateSession: vi.fn(), supabase: { auth: { getSession: vi.fn() } } }))
beforeEach(() => {
  vi.clearAllMocks()
  supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'supabase-user-token' } } })
})
afterEach(() => vi.unstubAllGlobals())

it('reads countries through FastAPI with the user JWT and never contacts REST Countries', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) })
  vi.stubGlobal('fetch', fetch)
  await api('/countries?q=mexico')
  const [url, request] = fetch.mock.calls[0]
  expect(url).toBe('http://127.0.0.1:8001/api/v1/countries?q=mexico')
  expect(request.headers.Authorization).toBe('Bearer supabase-user-token')
  expect(url).not.toContain('restcountries.com')
})

it('preserves the backend error when a session is rejected', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401, json: async () => ({ detail: 'La sesión fue rechazada.' }) }))
  await expect(api('/catalog')).rejects.toThrow('La sesión fue rechazada.')
  expect(invalidateSession).toHaveBeenCalledWith('La sesión fue rechazada.')
})

it('does not log out for an unavailable database or misconfigured backend', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 503, ok: false, json: async () => ({ detail: 'Configura el backend.' }) }))
  await expect(api('/catalog')).rejects.toThrow('Configura el backend.')
  expect(invalidateSession).not.toHaveBeenCalled()
})

it('preserves cancellation instead of displaying it as an error', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')))
  await expect(api('/catalog', { signal: new AbortController().signal })).rejects.toMatchObject({ name: 'AbortError' })
})
