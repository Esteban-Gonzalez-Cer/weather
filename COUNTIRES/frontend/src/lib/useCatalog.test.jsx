import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useCatalog } from './useCatalog.js'
import { api } from './api.js'

vi.mock('./api.js',()=>({api:vi.fn()}))
const catalog={total:1,status:'idle',last_success_at:'2026-10-28T00:00:00Z',regions:[{name:'Americas',count:1}]}
beforeEach(()=>vi.clearAllMocks())
afterEach(()=>vi.useRealTimers())

it('ignores a late response belonging to an older search',async()=>{
  let oldResolve
  api.mockImplementation(path=>{
    if(path==='/catalog')return Promise.resolve(catalog)
    const query=new URLSearchParams(path.split('?')[1]).get('q')
    if(query==='old')return new Promise(resolve=>{oldResolve=resolve})
    return Promise.resolve({items:[{code:query||'initial'}],total:1})
  })
  const {result}=renderHook(()=>useCatalog())
  await waitFor(()=>expect(result.current.loading).toBe(false))
  act(()=>result.current.changeFilter('query','old'))
  await waitFor(()=>expect(oldResolve).toBeDefined())
  act(()=>result.current.changeFilter('query','new'))
  await waitFor(()=>expect(result.current.result.items[0].code).toBe('new'))
  await act(async()=>oldResolve({items:[{code:'old'}],total:1}))
  expect(result.current.result.items[0].code).toBe('new')
})

it('polls queued catalog work every five seconds and stops after publication',async()=>{
  vi.useFakeTimers()
  let checks=0
  api.mockImplementation(path=>{
    if(path==='/catalog')return Promise.resolve({...catalog,status:++checks<3?'processing':'idle'})
    return Promise.resolve({items:[{code:'MEX'}],total:1})
  })
  const {result}=renderHook(()=>useCatalog())
  await act(async()=>{})
  expect(checks).toBe(1)
  await act(async()=>vi.advanceTimersByTimeAsync(4999))
  expect(checks).toBe(1)
  await act(async()=>vi.advanceTimersByTimeAsync(5001))
  expect(checks).toBe(3)
  expect(result.current.catalog.status).toBe('idle')
  await act(async()=>vi.advanceTimersByTimeAsync(20000))
  expect(checks).toBe(3)
})

it('retains a clear pending state after three minutes with a recheck action',async()=>{
  vi.useFakeTimers()
  api.mockResolvedValue({...catalog,status:'queued',total:0})
  const {result}=renderHook(()=>useCatalog())
  await act(async()=>{})
  await act(async()=>vi.advanceTimersByTimeAsync(180000))
  expect(result.current.longWait).toBe(true)
  const previous=api.mock.calls.length
  act(()=>result.current.recheck())
  await act(async()=>{})
  expect(api.mock.calls.length).toBe(previous+1)
  expect(result.current.longWait).toBe(false)
})
