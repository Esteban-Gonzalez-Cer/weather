import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import App from './App.jsx'
import { api, PendingJob, waitForJob } from './api.js'
import { bundle, location, recent } from '../qa/fixtures.js'

const context = vi.hoisted(() => ({ value: null }))
vi.mock('./auth.jsx', () => ({ useAuth: () => context.value }))
vi.mock('./api.js', () => ({ api: vi.fn(), waitForJob: vi.fn(), PendingJob: class extends Error { constructor(id) { super('La carga sigue pendiente.'); this.jobId = id } } }))

beforeEach(() => {
  vi.clearAllMocks()
  context.value = { session: { user: { id: 'alice', email: 'alice@example.test', user_metadata: { full_name: 'Alice' } } }, configured: true, signOut: vi.fn() }
})

it('restores a recent city, displays cached data while loading, and then uses the published result', async () => {
  const stale = { ...bundle, stale: true }
  api.mockImplementation(async path => {
    if (path === '/me/recent-locations') return recent
    if (path.endsWith('/select')) return { status: 'queued', job_id: 'job', data: stale }
    if (path.endsWith('/weather')) return bundle
    throw new Error('Unexpected route')
  })
  waitForJob.mockResolvedValue({ status: 'completed' })
  render(<App/>)
  await screen.findByRole('heading', { name: 'Parcialmente nublado' })
  await waitFor(() => expect(screen.queryByText(/Estás viendo la última carga/)).not.toBeInTheDocument())
  expect(waitForJob).toHaveBeenCalledWith('job', expect.any(AbortSignal))
  expect(api).toHaveBeenCalledWith(`/locations/${location.id}/weather`, expect.anything())
})

it('rechecks an existing pending job without submitting another ingestion request', async () => {
  api.mockImplementation(async path => path === '/me/recent-locations' ? recent : path.endsWith('/select') ? { status: 'queued', job_id: 'slow', data: bundle } : bundle)
  waitForJob.mockRejectedValueOnce(new PendingJob('slow')).mockResolvedValueOnce({ status: 'completed' })
  render(<App/>)
  await screen.findByText('La carga sigue pendiente.')
  fireEvent.click(screen.getByRole('button', { name: 'Volver a consultar' }))
  await waitFor(() => expect(waitForJob).toHaveBeenCalledTimes(2))
  expect(api.mock.calls.filter(([path]) => path.endsWith('/select'))).toHaveLength(1)
})

it('clears personal locations and pending UI state on logout', async () => {
  api.mockImplementation(async path => path === '/me/recent-locations' ? recent : { status: 'completed', data: bundle })
  const { rerender } = render(<App/>)
  await screen.findByRole('heading', { name: 'Parcialmente nublado' })
  context.value = { ...context.value, session: null }
  rerender(<App/>)
  expect(screen.getByRole('button', { name: /Continuar con Google/ })).toBeInTheDocument()
  context.value = { ...context.value, session: { user: { id: 'bob', user_metadata: {} } } }
  api.mockResolvedValue([])
  rerender(<App/>)
  await screen.findByText('El clima empieza por un lugar.')
  expect(screen.queryByText('Guadalajara')).not.toBeInTheDocument()
  expect(screen.queryByText(/Preparando Ciudad/)).not.toBeInTheDocument()
})
