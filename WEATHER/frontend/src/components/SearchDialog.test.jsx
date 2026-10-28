import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import SearchDialog from './SearchDialog.jsx'
import { api, waitForJob } from '../api.js'

vi.mock('../api.js', () => ({ api: vi.fn(), waitForJob: vi.fn(), PendingJob: class extends Error {} }))
beforeEach(() => vi.clearAllMocks())

it('shows region and country, supports arrow navigation and selection', async () => {
  const choose = vi.fn()
  api.mockResolvedValue({ status: 'completed', results: [{ id: '1', name: 'Springfield', region: 'Illinois', country: 'USA' }, { id: '2', name: 'Springfield', region: 'Queensland', country: 'Australia' }] })
  render(<SearchDialog onClose={vi.fn()} onSelect={choose}/>)
  fireEvent.change(screen.getByLabelText('Ciudad, región o país'), { target: { value: 'Springfield' } })
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
  await screen.findByText('Illinois, USA')
  fireEvent.keyDown(document, { key: 'ArrowDown' })
  expect(screen.getByRole('button', { name: /Illinois/ })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: /Queensland/ }))
  expect(choose.mock.calls[0][0].id).toBe('2')
})

it('discards an older search when the input changes', async () => {
  let resolve
  api.mockReturnValue(new Promise(value => { resolve = value }))
  render(<SearchDialog onClose={vi.fn()} onSelect={vi.fn()}/>)
  const input = screen.getByLabelText('Ciudad, región o país')
  fireEvent.change(input, { target: { value: 'Paris' } })
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
  fireEvent.change(input, { target: { value: 'Tokyo' } })
  resolve({ status: 'completed', results: [{ id: '1', name: 'Paris', region: '', country: 'France' }] })
  await waitFor(() => expect(screen.queryByText('France')).not.toBeInTheDocument())
  expect(input).toHaveValue('Tokyo')
})

it('waits for persisted results and shows an empty search clearly', async () => {
  api.mockResolvedValue({ status: 'queued', job_id: 'job' })
  waitForJob.mockResolvedValue({ status: 'completed', results: [] })
  render(<SearchDialog onClose={vi.fn()} onSelect={vi.fn()}/>)
  fireEvent.change(screen.getByLabelText('Ciudad, región o país'), { target: { value: 'Unknown' } })
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
  expect(await screen.findByText(/No encontramos ubicaciones/)).toBeInTheDocument()
  expect(waitForJob).toHaveBeenCalled()
})
