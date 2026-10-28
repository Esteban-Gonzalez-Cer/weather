import { StrictMode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { AuthProvider, invalidateSession, useAuth } from './auth.jsx'

const mock = vi.hoisted(() => ({ auth: { getSession: vi.fn(), exchangeCodeForSession: vi.fn(), signInWithOAuth: vi.fn(), signOut: vi.fn(), onAuthStateChange: vi.fn() }, callback: null }))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ auth: mock.auth })) }))
const userSession = { user: { id: 'alice' }, access_token: 'token' }
function Probe() {
  const context = useAuth()
  return <><span>{context.loading ? 'loading' : context.session?.access_token || 'signed-out'}</span><span>{context.error}</span><button onClick={context.signIn}>sign-in</button><button onClick={context.signOut}>sign-out</button></>
}
beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState({}, '', '/')
  mock.auth.onAuthStateChange.mockImplementation(callback => { mock.callback = callback; return { data: { subscription: { unsubscribe: vi.fn() } } } })
  mock.auth.getSession.mockResolvedValue({ data: { session: userSession } })
  mock.auth.exchangeCodeForSession.mockResolvedValue({ data: { session: userSession } })
  mock.auth.signInWithOAuth.mockResolvedValue({ error: null })
  mock.auth.signOut.mockResolvedValue({ error: null })
})

it('restores, refreshes, and clears the session', async () => {
  render(<AuthProvider><Probe/></AuthProvider>)
  await screen.findByText('token')
  act(() => mock.callback('TOKEN_REFRESHED', { ...userSession, access_token: 'renewed' }))
  expect(screen.getByText('renewed')).toBeInTheDocument()
  fireEvent.click(screen.getByText('sign-out'))
  await screen.findByText('signed-out')
})

it('starts Google OAuth with the local callback route', async () => {
  render(<AuthProvider><Probe/></AuthProvider>)
  await screen.findByText('token')
  fireEvent.click(screen.getByText('sign-in'))
  expect(mock.auth.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({ provider: 'google', options: expect.objectContaining({ redirectTo: `${window.location.origin}/auth/callback` }) }))
})

it('exchanges a PKCE callback only once in StrictMode', async () => {
  window.history.replaceState({}, '', '/auth/callback?code=one-use-code')
  render(<StrictMode><AuthProvider><Probe/></AuthProvider></StrictMode>)
  await screen.findByText('token')
  expect(mock.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1)
  expect(window.location.pathname).toBe('/')
})

it('keeps the rejection reason visible after the session ends', async () => {
  render(<AuthProvider><Probe/></AuthProvider>)
  await screen.findByText('token')
  await act(async () => {
    await invalidateSession('La sesión fue rechazada por la base de datos.')
    mock.callback('SIGNED_OUT', null)
  })
  expect(screen.getByText('signed-out')).toBeInTheDocument()
  expect(screen.getByText('La sesión fue rechazada por la base de datos.')).toBeInTheDocument()
  expect(mock.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
})
