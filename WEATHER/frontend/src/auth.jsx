import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL || ''
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''
export const configured = url.startsWith('https://') && !!key && !`${url}${key}`.includes('YOUR_')
export const supabase = configured ? createClient(url, key, {
  auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true, storageKey: 'bruma-auth' },
}) : null

const AuthContext = createContext(null)
let callbackExchange
const sessionErrorListeners = new Set()

export async function invalidateSession(message) {
  for (const report of sessionErrorListeners) report(message)
  await supabase.auth.signOut({ scope: 'local' })
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(!!supabase)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase) return
    let active = true
    sessionErrorListeners.add(setError)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, value) => {
      if (active) setSession(value)
    })
    async function restore() {
      try {
        const params = new URLSearchParams(window.location.search)
        let result
        if (window.location.pathname === '/auth/callback') {
          if (params.has('error')) throw new Error('No se completó el acceso con Google. Intenta de nuevo.')
          const code = params.get('code')
          if (!code) throw new Error('El enlace de acceso no es válido. Inicia sesión de nuevo.')
          // StrictMode can mount the callback twice. A PKCE code is single use.
          callbackExchange ??= supabase.auth.exchangeCodeForSession(code)
          result = await callbackExchange
          if (active) window.history.replaceState({}, '', '/')
        } else result = await supabase.auth.getSession()
        if (result.error) throw new Error('No se pudo recuperar tu sesión. Inicia sesión de nuevo.')
        if (active) setSession(result.data.session)
      } catch (problem) {
        if (active) {
          setError(problem.message)
          setSession(null)
          window.history.replaceState({}, '', '/')
        }
      } finally { if (active) setLoading(false) }
    }
    restore()
    return () => { active = false; sessionErrorListeners.delete(setError); subscription.unsubscribe() }
  }, [])

  async function signIn() {
    setError('')
    const { error: problem } = await supabase.auth.signInWithOAuth({ provider: 'google', options: {
      redirectTo: `${window.location.origin}/auth/callback`, scopes: 'openid email profile',
    } })
    if (problem) setError('No se pudo abrir el acceso con Google. Revisa la configuración e intenta de nuevo.')
  }

  async function signOut() {
    const { error: problem } = await supabase.auth.signOut({ scope: 'local' })
    if (problem) setError('No se pudo cerrar la sesión. Intenta de nuevo.')
    else setSession(null)
  }

  return <AuthContext.Provider value={{ session, loading, error, signIn, signOut, configured }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
