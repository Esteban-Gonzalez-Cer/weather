import { useCallback, useRef, useState } from 'react'
import { countryName, dateTime, number, regionLabel } from '../lib/format.js'
import CountryCard from './CountryCard.jsx'
import CountryModal from './CountryModal.jsx'
import Globe from './Globe.jsx'
import Icon from './Icon.jsx'

export function Brand() {
  return <a className="brand" href="/" aria-label="Orbe, inicio"><span><Icon name="globe" size={24}/></span>orbe<span className="brand-dot">.</span></a>
}

export function Header({ user, onSignOut }) {
  const username = user?.user_metadata?.full_name?.split(' ')[0] || 'Explorador'
  return <header className="site-header"><div className="header-inner"><Brand/>
    <nav aria-label="Principal"><a className="active" href="#catalog"><Icon name="compass" size={17}/>Explorar</a><a href="#about">Acerca de Orbe</a></nav>
    <div className="account"><span className="account-greeting">Hola, {username}</span><span className="avatar" aria-hidden="true">{username.slice(0, 1).toUpperCase()}</span><button className="icon-button" title="Cerrar sesión" aria-label="Cerrar sesión" onClick={onSignOut}><Icon name="logout" size={18}/></button></div>
  </div></header>
}

export function Hero({ catalog }) {
  return <section className="hero"><div className="hero-copy"><span className="eyebrow"><span className="little-line"/>LA CURIOSIDAD NO TIENE FRONTERAS</span><h1>Cada país,<br/>una nueva <span>historia.</span></h1><p>De una bandera a todo un mundo.<br className="desktop-break"/> Descubre los lugares que hacen único a nuestro planeta.</p><a className="primary-button" href="#catalog">Empieza a explorar<Icon name="arrow" size={18}/></a>
    <div className="hero-note"><span className="mini-orbits"><i/><i/><i/></span><span>Un planeta. Infinitas formas de descubrirlo.</span></div>
  </div><div className="hero-visual"><Globe/><div className="globe-chip top"><span className="chip-icon"><Icon name="compass"/></span><div><small>Tu siguiente descubrimiento</small><strong>Está más cerca de lo que crees</strong></div></div><div className="globe-chip bottom"><span className="chip-icon blue"><Icon name="globe"/></span><div><strong>{catalog?.total ? `${number(catalog.total)} países y territorios` : 'El mundo a tu alcance'}</strong><small>Una conexión con cada rincón</small></div><span className="chip-dot"/></div></div></section>
}

export default function Catalog({ state, user, onSignOut, loadCountry }) {
  const { catalog, catalogError, result, loading, listError, filters, changeFilter, clearFilters, refresh, requesting, notice, longWait, recheck } = state
  const [selected, setSelected] = useState(null)
  const closeModal = useCallback(() => setSelected(null), [])
  const search = useRef(null)
  const catalogHeading = useRef(null)
  const pending = catalog?.status === 'queued' || catalog?.status === 'processing'
  const hasFilters = !!(filters.query || filters.region)
  const totalPages = Math.ceil((result?.total || 0) / 12)
  function changePage(page) { changeFilter('page', page); catalogHeading.current?.focus(); catalogHeading.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }) }

  return <><a className="skip-link" href="#catalog">Ir al catálogo</a><Header user={user} onSignOut={onSignOut}/>
    <main className="page-shell"><Hero catalog={catalog}/>
      <section className="overview" aria-label="Resumen del catálogo">
        <div className="overview-item"><span className="stat-icon purple"><Icon name="globe" size={24}/></span><div><strong>{catalog ? number(catalog.total) : '—'}</strong><span>Países y territorios</span></div><span className="stat-decoration" aria-hidden="true">↗</span></div>
        <div className="overview-item"><span className="stat-icon blue"><Icon name="compass" size={24}/></span><div><strong>{catalog ? number(catalog.regions.length) : '—'}</strong><span>Regiones por explorar</span></div><div className="stat-bars" aria-hidden="true"><i/><i/><i/><i/><i/></div></div>
        <div className="overview-item update-item"><span className={`stat-icon ${catalog?.stale ? 'peach' : 'green'}`}><Icon name={pending ? 'refresh' : 'check'} size={23}/></span><div><strong className="status-text">{pending ? 'Actualizando' : catalog?.last_success_at ? 'Tu mundo, al día' : 'Listo para descubrir'}</strong><span>{catalog?.last_success_at ? dateTime(catalog.last_success_at) : 'A la espera del primer catálogo'}</span></div></div>
      </section>

      <section className="catalog-section" id="catalog" aria-labelledby="catalog-heading">
        <div className="section-heading"><div><span className="eyebrow">TU VENTANA AL MUNDO</span><h2 id="catalog-heading" ref={catalogHeading} tabIndex="-1">Explora el catálogo<span>.</span></h2></div><span className="catalog-tag"><Icon name="grid" size={16}/>Un país, una historia</span></div>
        <div className="filter-bar"><div className="search-field"><Icon name="search" size={20}/><input ref={search} type="search" maxLength="100" aria-label="Buscar un país" placeholder="¿Qué país quieres descubrir?" value={filters.query} onChange={event => changeFilter('query', event.target.value)}/>{filters.query && <button className="icon-button" aria-label="Limpiar búsqueda" onClick={() => { changeFilter('query', ''); search.current.focus() }}><Icon name="close" size={17}/></button>}</div>
          <div className="select-field"><Icon name="globe" size={17}/><select aria-label="Filtrar por región" value={filters.region} onChange={event => changeFilter('region', event.target.value)}><option value="">Todas las regiones</option>{catalog?.regions.map(r => <option key={r.name} value={r.name}>{regionLabel(r.name)} ({r.count})</option>)}</select><Icon name="down" size={14}/></div>
          <div className="select-field sort-field"><select aria-label="Ordenar países" value={filters.sort} onChange={event => changeFilter('sort', event.target.value)}><option value="name">Nombre: A — Z</option><option value="population">Mayor población</option><option value="area">Mayor superficie</option></select><Icon name="down" size={14}/></div>
        </div>
        <div className="results-toolbar"><div className="region-tabs" aria-label="Accesos por región"><button className={!filters.region ? 'selected' : ''} aria-pressed={!filters.region} onClick={() => changeFilter('region', '')}>Todo el mundo</button>{catalog?.regions.map(r => <button key={r.name} className={filters.region === r.name ? 'selected' : ''} aria-pressed={filters.region === r.name} onClick={() => changeFilter('region', r.name)}>{regionLabel(r.name)}</button>)}</div><p className="result-count" aria-live="polite">{loading ? 'Explorando…' : `${result?.total || 0} ${(result?.total || 0) === 1 ? 'resultado' : 'resultados'}`}</p></div>
        {hasFilters && <div className="active-filters"><span>{filters.query ? `Búsqueda: “${filters.query}”` : regionLabel(filters.region)}</span><button className="text-button" onClick={clearFilters}>Limpiar filtros <Icon name="close" size={13}/></button></div>}

        {(catalogError || catalog?.status === 'failed' || catalog?.stale && catalog?.total > 0 || pending) && <div className={`catalog-notice ${catalogError || catalog?.status === 'failed' ? 'warning' : ''}`} role={catalogError ? 'alert' : 'status'}><Icon name={pending ? 'refresh' : 'info'} size={19}/><div><strong>{catalogError ? 'No pudimos abrir el catálogo' : pending ? longWait ? 'La carga sigue pendiente' : 'Preparando el catálogo' : catalog?.status === 'failed' ? 'La actualización no se completó' : 'El catálogo necesita actualizarse'}</strong><p>{catalogError || (pending ? longWait ? 'Comprueba que Airflow esté en ejecución y vuelve a consultar.' : 'La primera carga puede tardar unos minutos. Puedes seguir explorando los datos guardados.' : catalog.last_error || 'Puedes seguir explorando mientras se prepara una nueva carga.')}</p></div><button className="text-button" onClick={recheck}>Volver a consultar<Icon name="refresh" size={14}/></button></div>}
        {notice && <p className="action-notice" role="status">{notice}</p>}
        {listError ? <div className="empty-state" role="alert"><Icon name="info" size={34}/><h3>No pudimos consultar los países</h3><p>{listError}</p><button className="primary-button" onClick={recheck}>Reintentar <Icon name="refresh" size={17}/></button></div> : loading ? <div className="country-grid" aria-label="Cargando países" aria-busy="true">{Array.from({ length: 8 }, (_, i) => <div className="skeleton-card" key={i}><div/><span/><span/><span/></div>)}</div> : catalog && !catalog.total ? <div className="empty-state"><div className="empty-globe"><Icon name="globe" size={45}/></div><h3>El viaje está a punto de empezar</h3><p>{pending ? 'Estamos reuniendo banderas e historias de todo el mundo.' : 'Carga el primer catálogo para descubrir todos los países y territorios.'}</p><button className="primary-button" disabled={requesting || pending} onClick={refresh}>{pending ? <><span className="spinner"/>Preparando catálogo…</> : <>Cargar catálogo<Icon name="arrow" size={17}/></>}</button><small>La carga requiere que Airflow esté en ejecución.</small></div> : !result?.items.length && !catalogError ? <div className="empty-state"><Icon name="search" size={35}/><h3>No encontramos ese destino</h3><p>Prueba con el nombre en español o inglés, o cambia de región.</p><button className="secondary-button" onClick={clearFilters}>Ver todos los países<Icon name="arrow" size={17}/></button></div> : !catalogError && <div className="country-grid">{result?.items.map(country => <CountryCard key={country.code} country={country} onSelect={setSelected}/>)}</div>}

        {!loading && !listError && totalPages > 1 && <nav className="pagination" aria-label="Páginas del catálogo"><span>Mostrando {(filters.page - 1) * 12 + 1}–{Math.min(filters.page * 12, result.total)} de {result.total} países</span><div><button className="page-step" disabled={filters.page === 1} onClick={() => changePage(filters.page - 1)} aria-label="Página anterior"><Icon name="arrow" size={17} style={{ transform: 'rotate(180deg)' }}/></button>{Array.from(new Set([1, filters.page - 1, filters.page, filters.page + 1, totalPages])).filter(p => p > 0 && p <= totalPages).sort((a, b) => a - b).map((p, index, pages) => <span className="page-wrapper" key={p}>{index > 0 && p - pages[index - 1] > 1 && <span className="page-ellipsis">…</span>}<button aria-label={`Página ${p}`} aria-current={filters.page === p ? 'page' : undefined} className={filters.page === p ? 'current-page' : ''} onClick={() => changePage(p)}>{p}</button></span>)}<button className="page-step" disabled={filters.page === totalPages} onClick={() => changePage(filters.page + 1)} aria-label="Página siguiente"><Icon name="arrow" size={17}/></button></div></nav>}
      </section>
      <footer className="site-footer" id="about"><div><Brand/><p>Un pequeño espacio para un mundo enorme.</p></div><div className="footer-source"><span>Información de REST Countries · Actualización diaria</span><button className="text-button" onClick={refresh} disabled={requesting || pending}><Icon name="refresh" size={14}/>{requesting ? 'Solicitando…' : pending ? 'Actualización en curso' : 'Comprobar actualización'}</button></div></footer>
    </main>{selected && <CountryModal country={selected} onClose={closeModal} loadCountry={loadCountry}/>}</>
}
