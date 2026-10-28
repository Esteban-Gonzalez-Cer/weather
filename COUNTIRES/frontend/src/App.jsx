import { useAuth } from './auth.jsx'
import { useCatalog } from './lib/useCatalog.js'
import Catalog, { Brand } from './components/Catalog.jsx'
import Globe from './components/Globe.jsx'
import Icon, { GoogleIcon } from './components/Icon.jsx'

function SignedInApp({ session, signOut }) {
  const state = useCatalog()
  return <Catalog state={state} user={session.user} onSignOut={signOut}/>
}

export default function App() {
  const { session, loading, error, signIn, signOut, configured } = useAuth()
  if (loading) return <div className="session-loading" role="status"><Brand/><span className="spinner"/>Preparando tu próxima aventura…</div>
  if (session) return <SignedInApp session={session} signOut={signOut}/>
  return <div className="welcome"><header className="welcome-header"><Brand/><span>EXPLORA. APRENDE. DESCUBRE.</span></header><main className="welcome-main"><div className="welcome-copy"><span className="eyebrow"><span className="little-line"/>UN MUNDO POR DESCUBRIR</span><h1>Tu curiosidad.<br/>Todo un <span>planeta.</span></h1><p>Banderas, idiomas y lugares que todavía no conoces.<br/>Tu próxima historia empieza en Orbe.</p><button className="google-button" onClick={signIn} disabled={!configured}><GoogleIcon/>Continuar con Google<Icon name="arrow" size={18}/></button><small>Inicia sesión y encuentra tu próximo descubrimiento.</small>{error && <p className="welcome-error" role="alert">{error}</p>}{!configured && <div className="setup-note" role="status"><Icon name="info" size={19}/><span>Falta conectar el proyecto Supabase de esta aplicación. Sigue los pasos del README y configura el archivo frontend/.env.</span></div>}</div><div className="welcome-globe"><Globe/><span className="welcome-caption"><Icon name="spark" size={16}/>La curiosidad nos lleva más lejos.</span></div></main><footer className="welcome-footer"><span>Orbe · Una ventana al mundo</span><span>Hecho para explorar, a tu ritmo.</span></footer></div>
}
