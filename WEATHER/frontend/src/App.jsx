import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from './auth.jsx'
import { api, PendingJob, waitForJob } from './api.js'
import { localDate, localTime } from './format.js'
import { Cloudscape, Icon, WeatherIcon } from './components/Icons.jsx'
import SearchDialog from './components/SearchDialog.jsx'
import Dashboard from './components/Dashboard.jsx'

function Welcome() {
  const { signIn, configured, loading, error } = useAuth()
  const [starting, setStarting] = useState(false)
  return <main className="welcome-page"><div className="welcome-brand"><span className="brand-symbol">b.</span>bruma<span className="brand-tag">TU VENTANA AL CLIMA</span></div><section className="welcome-card panel"><div className="welcome-sky"><Cloudscape/><WeatherIcon code={1003} size={210}/><span>EL CIELO TIENE ALGO QUE CONTARTE</span></div><div className="welcome-copy"><span className="eyebrow">CERCA DE TI, DONDE ESTÉS</span><h1>Cada lugar,<br/>un nuevo cielo.</h1><p>El clima de ahora y lo que viene. Encuentra tu ciudad y mira los próximos tres días con claridad.</p>
    {loading ? <p className="welcome-status" role="status"><span className="spinner"/>Recuperando tu sesión…</p> : configured ? <button className="google-button" disabled={starting} onClick={async () => {
      setStarting(true)
      try { await signIn() } finally { setStarting(false) }
    }}><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2.2H12v4.2h5.4a4.7 4.7 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.5Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1a6 6 0 0 1-5.6-4.2H3.1v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9l3.3-2.6Z"/><path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.9 1.5l2.9-2.8A9.5 9.5 0 0 0 12 2a10 10 0 0 0-8.9 5.5l3.3 2.6A6 6 0 0 1 12 5.9Z"/></svg>{starting ? 'Abriendo Google…' : 'Continuar con Google'}<Icon name="arrow" size={18}/></button> : <div className="setup-notice" role="status"><strong>Un paso antes de mirar al cielo</strong><p>Configura la URL y la clave pública de Supabase en el archivo .env del frontend. Encontrarás los pasos en el README de WEATHER.</p></div>}
    {error && <p className="error-text" role="alert">{error}</p>}<small className="welcome-note">Tu cuenta conecta tus lugares. El pronóstico hace el resto.</small></div></section><footer className="welcome-footer"><span>Una mirada más tranquila al clima.</span><span>Actualizaciones cada 30 minutos · WeatherAPI.com</span></footer></main>
}

export default function App() {
  const { session, loading, signOut, error: authError } = useAuth()
  const [searchOpen, setSearchOpen] = useState(false)
  const [recent, setRecent] = useState([])
  const [selected, setSelected] = useState(null)
  const [bundle, setBundle] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [problem, setProblem] = useState('')
  const [pending, setPending] = useState(null)
  const controller = useRef(null)
  const userId = session?.user.id
  const closeSearch = useCallback(() => setSearchOpen(false), [])

  const loadRecent = useCallback(async signal => {
    const rows = await api('/me/recent-locations', { signal })
    if (!signal.aborted) setRecent(rows)
    return rows
  }, [])

  const select = useCallback(async (location, existingJob = null) => {
    controller.current?.abort()
    const active = new AbortController()
    controller.current = active
    setSearchOpen(false); setSelected(location); setBusy(true); setProblem(''); setPending(null)
    setBundle(previous => previous?.location.id === location.id ? previous : null)
    setMessage('Consultando los datos guardados…')
    try {
      let result = existingJob ? { job_id: existingJob } : await api(`/locations/${location.id}/select`, { method: 'POST', signal: active.signal })
      if (active.signal.aborted) return
      if (result.data) setBundle(result.data)
      if (result.status !== 'completed') {
        setMessage('Preparando el pronóstico. La primera carga puede tardar de uno a dos minutos.')
        await waitForJob(result.job_id, active.signal)
        result = { data: await api(`/locations/${location.id}/weather`, { signal: active.signal }) }
      }
      if (active.signal.aborted) return
      setBundle(result.data); setMessage('')
      await loadRecent(active.signal)
    } catch (error) {
      if (active.signal.aborted) return
      setProblem(error.message)
      if (error instanceof PendingJob) setPending(error.jobId)
    } finally { if (!active.signal.aborted) setBusy(false) }
  }, [loadRecent])

  useEffect(() => {
    if (!userId) { controller.current?.abort(); setBundle(null); setSelected(null); setRecent([]); setProblem(''); setMessage(''); setBusy(false); setPending(null); setSearchOpen(false); return }
    const active = new AbortController()
    loadRecent(active.signal).then(rows => {
      if (!active.signal.aborted && rows.length) select(rows[0].location)
    }).catch(error => { if (!active.signal.aborted) setProblem(error.message) })
    return () => { active.abort(); controller.current?.abort() }
  }, [userId, loadRecent, select])

  useEffect(() => {
    if (!userId || !selected?.id) return
    const active = new AbortController()
    const id = selected.id
    const timer = setInterval(async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const data = await api(`/locations/${id}/weather`, { signal: active.signal })
        if (!active.signal.aborted) setBundle(previous => previous?.location.id === id ? data : previous)
      } catch (error) { if (!active.signal.aborted) setProblem(error.message) }
    }, 60_000)
    return () => { active.abort(); clearInterval(timer) }
  }, [userId, selected?.id])

  if (loading || !session) return <Welcome/>
  const location = bundle?.location || selected
  const zone = location?.timezone || 'UTC'
  const initial = (session.user.user_metadata?.full_name || session.user.email || 'U').slice(0, 1).toUpperCase()

  return <main className="app-shell">
    <aside className="sidebar"><a className="brand-symbol" href="#overview" aria-label="Bruma, inicio">b.</a><nav aria-label="Navegación principal"><a className="nav-item active" href="#overview" aria-label="Resumen del clima"><Icon name="home" size={23}/></a><button className="nav-item" aria-label="Buscar una ciudad" onClick={() => setSearchOpen(true)}><Icon name="search" size={23}/></button><a className="nav-item" href="#recent-heading" aria-label="Ir a tus últimos destinos"><Icon name="pin" size={23}/></a></nav><div className="sidebar-bottom"><span className="sidebar-live"><span className="status-dot"/>TU CUENTA</span><button className="avatar" title={session.user.user_metadata?.full_name || 'Tu cuenta'} aria-label="Cerrar sesión" onClick={signOut}>{initial}<Icon name="logout" size={15}/></button></div></aside>
    <div className="workspace" id="overview"><header className="app-header"><div className="location-heading"><span className="location-pin"><Icon name="pin" size={23}/></span><div><h2>{location ? [location.name, location.region !== location.name ? location.region : '', location.country].filter(Boolean).join(', ') : 'Tu ventana al clima'}</h2><p>{location ? localDate(new Date().toISOString(), zone) : 'Cada lugar tiene algo que contar.'}</p></div></div><button className="search-trigger" onClick={() => setSearchOpen(true)}><Icon name="search" size={18}/><span>Explorar ciudades</span><kbd>↵</kbd></button></header>
      <div className="overview-heading"><div><span className="eyebrow">UNA MIRADA AL EXTERIOR</span><h2>El cielo, en perspectiva<span>.</span></h2></div><div className="update-control"><span className={bundle?.stale ? 'stale-dot' : 'status-dot'}/><span>{bundle?.current ? `Guardado a las ${localTime(bundle.current.fetched_at, zone)}` : 'Esperando una ubicación'}</span><button className={`icon-button ${busy ? 'rotating' : ''}`} disabled={!selected || busy} onClick={() => select(selected, pending)} aria-label="Consultar actualización"><Icon name="refresh" size={17}/></button></div></div>
      {bundle?.stale && bundle.current && <div className="notice stale-notice" role="status"><Icon name="info"/><span>Estás viendo la última carga disponible. Los datos necesitan actualizarse.</span></div>}
      {busy && <div className="notice" role="status"><span className="spinner"/><span>{message}</span></div>}
      {(problem || authError) && <div className="notice error-notice" role="alert"><Icon name="info"/><span>{problem || authError}</span><button className="text-button" onClick={() => selected ? select(selected, pending) : loadRecent(new AbortController().signal).then(rows => { if (rows.length) select(rows[0].location); else setProblem('') }).catch(error => setProblem(error.message))}>{pending ? 'Volver a consultar' : 'Reintentar'}</button></div>}
      {bundle?.current ? <Dashboard bundle={bundle} recent={recent} onSelect={select} onSearch={() => setSearchOpen(true)}/> : <section className="empty-state panel"><Cloudscape/><WeatherIcon code={busy ? 1006 : 1003} size={150}/><span className="eyebrow">{busy ? 'CONECTANDO CON TU CIELO' : 'TU PRÓXIMO DESTINO'}</span><h1>{busy ? `Preparando ${selected?.name || 'el pronóstico'}…` : 'El clima empieza por un lugar.'}</h1><p>{busy ? 'Buscamos las condiciones y el pronóstico de tres días. Puedes explorar otra ciudad mientras esperas.' : 'Busca una ciudad para conocer cómo se siente afuera, desde el primer rayo de sol hasta la última hora del día.'}</p><button className="primary-button" onClick={() => setSearchOpen(true)}><Icon name="search" size={18}/>{busy ? 'Explorar otra ciudad' : 'Buscar una ciudad'}</button></section>}
      <footer className="app-footer"><span>bruma<span className="footer-dot">.</span> <small>Hecho para mirar hacia afuera.</small></span><span>Pronósticos de hasta 3 días · Actualización cada 30 min</span></footer>
    </div>
    {searchOpen && <SearchDialog onClose={closeSearch} onSelect={select}/>}
  </main>
}
