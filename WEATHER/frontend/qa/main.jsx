import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import Dashboard from '../src/components/Dashboard.jsx'
import { Icon } from '../src/components/Icons.jsx'
import { bundle, recent } from './fixtures.js'
import '../src/styles.css'

function VisualFixture() {
  const [notice, setNotice] = useState('Datos ficticios para comprobar el diseño. Esta página no consulta servicios ni permite iniciar sesión.')
  return <main className="app-shell"><aside className="sidebar"><a className="brand-symbol" href="/">b.</a><nav aria-label="Vista de prueba"><a className="nav-item active" href="#overview" aria-label="Resumen"><Icon name="home"/></a></nav><div className="sidebar-bottom"><span className="eyebrow">QA</span></div></aside><div className="workspace" id="overview"><header className="app-header"><div className="location-heading"><Icon name="pin"/><div><h2>Ciudad de México, CDMX, México</h2><p>Viernes, 23 de octubre · DATOS FICTICIOS</p></div></div><a className="search-trigger" href="/"><span>Ir a la aplicación</span><Icon name="arrow"/></a></header><div className="overview-heading"><div><span className="eyebrow">UNA MIRADA AL EXTERIOR</span><h2>El cielo, en perspectiva<span>.</span></h2></div><div className="update-control"><span className="status-dot"/>Prueba visual</div></div><div className="notice" role="status">{notice}</div><Dashboard bundle={bundle} recent={recent} onSelect={() => setNotice('Vista de diseño: los destinos de esta página son ficticios. Usa la aplicación para consultar una ciudad real.')} onSearch={() => setNotice('La búsqueda real requiere configurar las cuentas e iniciar sesión en la aplicación.')}/><footer className="app-footer"><span>bruma.</span><span>Vista aislada de pruebas · no se incluye en la compilación de producción</span></footer></div></main>
}
createRoot(document.getElementById('root')).render(<VisualFixture/> )
