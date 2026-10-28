// Isolated visual fixture. Not an authentication bypass or part of the production build.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import Catalog from '../src/components/Catalog.jsx'
import fixtures from './fixtures.json'
import '../src/styles.css'
import '../src/readability.css'

const fold = value => value.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase()
const regions = [...new Set(fixtures.map(c=>c.region))].sort().map(name=>({ name, count:fixtures.filter(c=>c.region===name).length }))
const loadCountry = async code => fixtures.find(c=>c.code===code)

function Preview() {
  const [filters,setFilters]=useState({query:'',region:'',sort:'name',page:1})
  const [notice,setNotice]=useState('')
  const filtered=fixtures.filter(c=>(!filters.region||filters.region===c.region)&&fold(`${c.spanish_name} ${c.name} ${c.code} ${c.alpha2}`).includes(fold(filters.query)))
    .sort((a,b)=>filters.sort==='population'?(b.population||0)-(a.population||0):filters.sort==='area'?(b.area_km2||0)-(a.area_km2||0):a.spanish_name.localeCompare(b.spanish_name,'es'))
  const data={catalog:{total:fixtures.length,regions,last_success_at:fixtures[0].ingested_at,status:'idle',stale:false},
    result:{items:filtered.slice((filters.page-1)*12,filters.page*12),total:filtered.length},filters,notice,
    changeFilter:(key,value)=>setFilters(v=>({...v,[key]:value,page:key==='page'?value:1})),
    clearFilters:()=>setFilters({query:'',region:'',sort:'name',page:1}),
    refresh:()=>setNotice('Vista de prueba: no se envían solicitudes a servicios externos.'),recheck:()=>{},loading:false}
  return <><div style={{background:'#e7dff9',color:'#806497',padding:'8px 16px',textAlign:'center',fontSize:10}}>Vista de prueba · Datos de ejemplo · Sin conexión a cuentas externas</div><Catalog state={data} user={{user_metadata:{full_name:'Esteban'}}} onSignOut={()=>location.assign('/')} loadCountry={loadCountry}/></>
}

const root = createRoot(document.getElementById('root'))
root.render(<Preview/>)
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount())
