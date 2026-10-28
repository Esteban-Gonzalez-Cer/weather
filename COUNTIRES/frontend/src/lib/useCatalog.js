import { useEffect, useState } from 'react'
import { api } from './api.js'

export function useCatalog() {
  const [catalog, setCatalog] = useState(null)
  const [catalogError, setCatalogError] = useState('')
  const [tick, setTick] = useState(0)
  const [longWait, setLongWait] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [notice, setNotice] = useState('')
  const [filters, setFilters] = useState({ query: '', region: '', sort: 'name', page: 1 })
  const [query, setQuery] = useState('')
  const [result, setResult] = useState(null)
  const [listError, setListError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setQuery(filters.query.trim()), 300)
    return () => clearTimeout(timer)
  }, [filters.query])

  useEffect(() => {
    const controller = new AbortController()
    const started = Date.now()
    let timer
    setCatalogError('')
    setLongWait(false)
    async function load() {
      try {
        const data = await api('/catalog', { signal: controller.signal })
        if (controller.signal.aborted) return
        setCatalog(data)
        if (data.status === 'queued' || data.status === 'processing') {
          if (Date.now() - started < 180_000) timer = setTimeout(load, 5000)
          else setLongWait(true)
        }
      } catch (error) {
        if (!controller.signal.aborted) { setCatalogError(error.message); setLoading(false) }
      }
    }
    load()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [tick])

  useEffect(() => {
    if (!catalog) return
    if (!catalog.total) { setResult({ items: [], total: 0, page: 1, page_size: 12 }); setLoading(false); return }
    const controller = new AbortController()
    setLoading(true)
    setListError('')
    const params = new URLSearchParams({ q: query, region: filters.region, sort: filters.sort, page: filters.page, page_size: 12 })
    api(`/countries?${params}`, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) {
        if (filters.page > 1 && !data.items.length && data.total > 0) setFilters(v => ({ ...v, page: 1 }))
        else setResult(data)
      }
    }).catch(error => { if (!controller.signal.aborted) setListError(error.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [catalog?.total, catalog?.last_success_at, query, filters.region, filters.sort, filters.page, tick])

  function changeFilter(key, value) {
    setFilters(previous => ({ ...previous, [key]: value, page: key === 'page' ? value : 1 }))
  }
  function clearFilters() { setFilters({ query: '', region: '', sort: 'name', page: 1 }) }

  async function refresh() {
    setRequesting(true)
    setNotice('')
    try {
      const response = await api('/catalog/refresh', { method: 'POST' })
      setNotice(response.status === 'fresh' ? 'El catálogo ya está al día.' : 'Carga solicitada. Los países aparecerán al terminar.')
      setTick(t => t + 1)
    } catch (error) { setNotice(error.message) }
    finally { setRequesting(false) }
  }

  return { catalog, catalogError, result, loading, listError, filters, changeFilter, clearFilters,
    refresh, requesting, notice, longWait, recheck: () => setTick(t => t + 1) }
}
