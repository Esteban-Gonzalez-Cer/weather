import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import Catalog from './Catalog.jsx'
import { api } from '../lib/api.js'

vi.mock('../lib/api.js', () => ({ api: vi.fn() }))
const country = { code:'MEX',alpha2:'MX',name:'Mexico',spanish_name:'México',region:'Americas',capitals:['Ciudad de México'],population:0,area_km2:null,flag_png_base64:'database-png' }
const detail = { ...country, official_name:'United Mexican States',native_names:{spa:{common:'México'}},subregion:'Central America',languages:[{name:'Spanish',native_name:'Español'}],currencies:[{code:'MXN',name:'Mexican peso',symbol:'$'}],continents:['North America'],timezones:['UTC-06:00'],borders:['USA','GTM','BLZ'],calling_codes:['52'],tlds:['.mx'],independent:true,un_member:true,ingested_at:'2026-10-28T00:00:00Z' }
function state(overrides={}) {
  return { catalog:{total:25,last_success_at:'2026-10-28T00:00:00Z',stale:false,status:'idle',regions:[{name:'Americas',count:10},{name:'Europe',count:15}]},
    result:{items:[country],total:25,page:1,page_size:12},filters:{query:'',region:'',sort:'name',page:1},loading:false,
    changeFilter:vi.fn(),clearFilters:vi.fn(),refresh:vi.fn(),recheck:vi.fn(),...overrides }
}
beforeEach(() => { vi.clearAllMocks(); api.mockResolvedValue(detail); Element.prototype.scrollIntoView=vi.fn() })

it('renders flags exclusively from saved database content and displays zero population', () => {
  render(<Catalog state={state()} user={{}} onSignOut={()=>{}}/>)
  expect(screen.getByAltText('Bandera de México').src).toBe('data:image/png;base64,database-png')
  expect(screen.getByRole('button',{name:'Explorar México'})).toHaveTextContent('0')
  expect([...document.images].every(image => image.src.startsWith('data:'))).toBe(true)
})

it('connects country search, region selection and sort controls', () => {
  const data=state(); render(<Catalog state={data} user={{}} onSignOut={()=>{}}/>)
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'mexico'}})
  fireEvent.change(screen.getByLabelText('Filtrar por región'),{target:{value:'Europe'}})
  fireEvent.change(screen.getByLabelText('Ordenar países'),{target:{value:'area'}})
  expect(data.changeFilter.mock.calls).toEqual([['query','mexico'],['region','Europe'],['sort','area']])
})

it('opens the selected country details, traps focus, closes with Escape and returns focus', async () => {
  render(<Catalog state={state()} user={{}} onSignOut={()=>{}}/>)
  const card=screen.getByRole('button',{name:'Explorar México'})
  card.focus(); fireEvent.click(card)
  const dialog=screen.getByRole('dialog',{name:'México'})
  expect(await within(dialog).findByText('Español')).toBeInTheDocument()
  expect(api).toHaveBeenCalledWith('/countries/MEX',expect.anything())
  expect(within(dialog).getByText('No disponible')).toBeInTheDocument()
  const close=within(dialog).getByRole('button',{name:'Cerrar detalles'})
  expect(document.activeElement).toBe(close)
  fireEvent.keyDown(document,{key:'Tab'})
  expect(document.activeElement).toBe(close)
  fireEvent.keyDown(document,{key:'Escape'})
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(document.activeElement).toBe(card)
})

it('shows retryable detail errors without using another provider or stale modal content', async () => {
  api.mockRejectedValueOnce(new Error('No se pudo consultar.'))
  render(<Catalog state={state()} user={{}} onSignOut={()=>{}}/>)
  fireEvent.click(screen.getByRole('button',{name:'Explorar México'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo consultar.')
  api.mockResolvedValueOnce(detail)
  fireEvent.click(screen.getByRole('button',{name:/Reintentar/}))
  expect(await screen.findByText('Español')).toBeInTheDocument()
})

it('supports pagination with the active filters', () => {
  const data=state();render(<Catalog state={data} user={{}} onSignOut={()=>{}}/>)
  fireEvent.click(screen.getByRole('button',{name:'Página siguiente'}))
  expect(data.changeFilter).toHaveBeenCalledWith('page',2)
  expect(screen.getByRole('button',{name:'Página anterior'})).toBeDisabled()
})

it('shows empty filters, stopped-pipeline and stale-data states with working actions', () => {
  const data=state({result:{items:[],total:0},filters:{query:'unknown',region:'Europe',sort:'name',page:1},catalog:{total:25,status:'processing',stale:true,regions:[]},longWait:true})
  render(<Catalog state={data} user={{}} onSignOut={()=>{}}/>)
  expect(screen.getByText('No encontramos ese destino')).toBeInTheDocument()
  expect(screen.getByText('La carga sigue pendiente')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:/Volver a consultar/}))
  expect(data.recheck).toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:/Ver todos los países/}))
  expect(data.clearFilters).toHaveBeenCalled()
})

it('offers an initial catalog load when Supabase has no saved countries', () => {
  const data=state({catalog:{total:0,status:'idle',regions:[]},result:{items:[],total:0}})
  render(<Catalog state={data} user={{}} onSignOut={()=>{}}/>)
  fireEvent.click(screen.getByRole('button',{name:/Cargar catálogo/}))
  expect(data.refresh).toHaveBeenCalled()
})
