import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { countryName, dateTime, flagSource, number, regionLabel } from '../lib/format.js'
import Icon from './Icon.jsx'

function Fact({ label, children }) {
  return <div className="fact"><dt>{label}</dt><dd>{children || 'No disponible'}</dd></div>
}

const defaultLoadCountry = (code, signal) => api(`/countries/${code}`, { signal })

export default function CountryModal({ country, onClose, loadCountry = defaultLoadCountry }) {
  const panel = useRef(null)
  const closeButton = useRef(null)
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const opener = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButton.current?.focus()
    function onKey(event) {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab') {
        const elements = [...panel.current.querySelectorAll('button:not(:disabled),a[href],[tabindex="0"]')]
        const first = elements[0], last = elements.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', onKey); opener?.focus() }
  }, [onClose])

  useEffect(() => {
    const controller = new AbortController()
    setError(''); setLoading(true); setDetail(null)
    loadCountry(country.code, controller.signal).then(data => {
      if (!controller.signal.aborted) setDetail(data)
    }).catch(problem => { if (!controller.signal.aborted) setError(problem.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [country.code, retry, loadCountry])

  const shown = detail || country
  return <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={panel} className="country-dialog" role="dialog" aria-modal="true" aria-labelledby="country-title">
      <button ref={closeButton} className="icon-button modal-close" aria-label="Cerrar detalles" onClick={onClose}><Icon name="close"/></button>
      <div className="country-modal">
      <div className={`modal-flag-panel region-${country.region.toLowerCase()}`}>
        <span className="eyebrow">UNA MIRADA AL MUNDO</span>
        <img src={flagSource(shown)} alt={`Bandera de ${countryName(shown)}`} width="320" height="200"/>
        <span className="modal-code">{country.alpha2}<span> / {country.code}</span></span>
        <div className="flag-caption"><Icon name="globe" size={16}/>Cada bandera cuenta una historia.</div>
      </div>
      <div className="modal-content">
        <span className="region-pill">{regionLabel(shown.region)}</span>
        <h2 id="country-title">{countryName(shown)}</h2>
        <p className="official-name">{detail?.official_name || country.name}</p>
        <div aria-live="polite">
          {loading && <p className="loading-line"><span className="spinner"/>Consultando detalles…</p>}
          {error && <div className="inline-error" role="alert"><p>{error}</p><button className="text-button" onClick={() => setRetry(v => v + 1)}>Reintentar <Icon name="refresh" size={15}/></button></div>}
        </div>
        {detail && <>
          <div className="detail-highlights"><div><Icon name="people"/><strong>{number(detail.population)}</strong><span>Habitantes</span></div><div><Icon name="layers"/><strong>{number(detail.area_km2)}<small> km²</small></strong><span>Superficie</span></div></div>
          <dl className="facts-grid">
            <Fact label={detail.capitals.length > 1 ? 'Capitales' : 'Capital'}>{detail.capitals.join(', ')}</Fact>
            <Fact label="Subregión">{detail.subregion}</Fact>
            <Fact label="Idiomas">{detail.languages.map(v => v.native_name || v.name).join(', ')}</Fact>
            <Fact label="Monedas">{detail.currencies.map(v => `${v.name || v.code} (${v.code}${v.symbol ? ` · ${v.symbol}` : ''})`).join(', ')}</Fact>
            <Fact label="Nombre nativo">{[...new Set(Object.values(detail.native_names).map(v => v.common).filter(Boolean))].join(' · ')}</Fact>
            <Fact label="Continentes">{detail.continents.map(regionLabel).join(', ')}</Fact>
            <Fact label="Prefijo telefónico">{detail.calling_codes.map(v => `+${v.replace(/^\+/, '')}`).join(', ')}</Fact>
            <Fact label="Dominio de internet">{detail.tlds.join(', ')}</Fact>
            <Fact label="Estado soberano">{detail.independent == null ? 'No disponible' : detail.independent ? 'Sí' : 'No'}</Fact>
            <Fact label="Miembro de la ONU">{detail.un_member == null ? 'No disponible' : detail.un_member ? 'Sí' : 'No'}</Fact>
            <Fact label="Husos horarios">{detail.timezones.join(' · ')}</Fact>
            <Fact label="Fronteras (ISO)">{detail.borders.length ? detail.borders.join(' · ') : 'Sin fronteras terrestres'}</Fact>
          </dl>
          <p className="detail-source"><Icon name="check" size={14}/>Catálogo actualizado: {dateTime(detail.ingested_at)}</p>
        </>}
      </div>
      </div>
    </section>
  </div>
}
