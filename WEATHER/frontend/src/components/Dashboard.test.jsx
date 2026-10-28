import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import Dashboard from './Dashboard.jsx'
import { bundle, recent } from '../../qa/fixtures.js'

it('keeps current observations separate from forecast day/hour details', () => {
  render(<Dashboard bundle={bundle} recent={recent} onSelect={vi.fn()} onSearch={vi.fn()}/>)
  const hero = screen.getByRole('heading', { level: 1 }).closest('section')
  expect(within(hero).getByText('22°')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /sábado.*25°.*13°/ }))
  expect(screen.getByRole('heading', { name: 'Detalle del pronóstico' })).toBeInTheDocument()
  expect(within(hero).getByText('22°')).toBeInTheDocument()
  expect(screen.getByText('Pronóstico', { exact: true })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Ahora' }))
  expect(screen.getByRole('heading', { name: 'Condiciones actuales' })).toBeInTheDocument()
})

it('does not invent measurements when fields are missing', () => {
  const data = structuredClone(bundle)
  data.current.humidity = null
  data.current.wind_degree = null
  render(<Dashboard bundle={data} recent={[]} onSelect={vi.fn()} onSearch={vi.fn()}/>)
  expect(screen.getByText('Dirección no disponible')).toBeInTheDocument()
  expect(screen.getByText('Humedad').closest('div')).toHaveTextContent('—')
})
