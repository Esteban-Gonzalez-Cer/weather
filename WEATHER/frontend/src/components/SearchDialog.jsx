import { useEffect, useRef, useState } from 'react'
import { api, PendingJob, waitForJob } from '../api.js'
import { Icon } from './Icons.jsx'

export default function SearchDialog({ onClose, onSelect }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(null)
  const controller = useRef(null)
  const dialog = useRef(null)
  const input = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    input.current?.focus()
    const handle = event => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab') {
        const targets = Array.from(dialog.current.querySelectorAll('button:not([disabled]),input,a[href]'))
        const first = targets[0], last = targets.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
        const options = Array.from(dialog.current.querySelectorAll('.search-result'))
        if (options.length) {
          event.preventDefault()
          const index = options.indexOf(document.activeElement)
          options[(index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length].focus()
        }
      }
    }
    document.addEventListener('keydown', handle)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      controller.current?.abort()
      document.removeEventListener('keydown', handle)
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [onClose])

  async function search(event, jobId = null) {
    event?.preventDefault()
    controller.current?.abort()
    const active = new AbortController()
    controller.current = active
    setBusy(true); setMessage('Buscando ubicaciones…'); setResults(null); setPending(null)
    try {
      let response = jobId ? { job_id: jobId } : await api('/searches', { method: 'POST', body: { query: query.trim() }, signal: active.signal })
      if (response.status !== 'completed') {
        setMessage('Estamos buscando esta ciudad por primera vez. Airflow guardará los resultados; puede tardar un minuto.')
        response = await waitForJob(response.job_id, active.signal)
      }
      if (active.signal.aborted) return
      setResults(response.results || [])
      setMessage(response.results?.length ? '' : 'No encontramos ubicaciones. Prueba con otra ciudad, región o país.')
    } catch (error) {
      if (active.signal.aborted) return
      setMessage(error.message)
      if (error instanceof PendingJob) setPending(error.jobId)
    } finally { if (!active.signal.aborted) setBusy(false) }
  }

  return <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={dialog} className="search-dialog panel" role="dialog" aria-modal="true" aria-labelledby="search-heading" aria-describedby="search-help">
      <div className="section-title"><div><span className="eyebrow">UN LUGAR, SU CLIMA</span><h2 id="search-heading">¿A dónde miramos?</h2></div><button className="icon-button" aria-label="Cerrar búsqueda" onClick={onClose}><Icon name="close"/></button></div>
      <p id="search-help" className="muted">Busca una ciudad y elige la ubicación correcta.</p>
      <form onSubmit={search} className="search-form">
        <label htmlFor="city-search" className="sr-only">Ciudad, región o país</label>
        <Icon name="search"/>
        <input ref={input} id="city-search" autoComplete="off" placeholder="Ciudad, región o país…" minLength={2} maxLength={100} required value={query} onChange={event => {
          controller.current?.abort(); setQuery(event.target.value); setResults(null); setMessage(''); setBusy(false); setPending(null)
        }}/>
        <button className="primary-button" disabled={busy || query.trim().length < 2}>Buscar</button>
      </form>
      <div className="search-status" role="status" aria-live="polite">{busy && <span className="spinner"/>}{message}</div>
      {pending && <button className="text-button" onClick={() => search(null, pending)}>Volver a consultar <Icon name="refresh" size={16}/></button>}
      {!!results?.length && <ul className="search-results">{results.map(location => <li key={location.id}><button className="search-result" onClick={() => onSelect(location)}>
        <span className="result-pin"><Icon name="pin"/></span><span><strong>{location.name}</strong><small>{[location.region, location.country].filter(Boolean).join(', ')}</small></span><Icon name="arrow"/>
      </button></li>)}</ul>}
      <div className="search-footnote"><span className="status-dot"/>Los resultados se guardan antes de mostrarse.</div>
    </section>
  </div>
}
