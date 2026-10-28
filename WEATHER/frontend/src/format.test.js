import { describe, expect, it } from 'vitest'
import { localTime, metric, number, temp, windDirection } from './format.js'
import { weatherFamily } from './components/Icons.jsx'

describe('weather presentation', () => {
  it('keeps unavailable values different from zero', () => {
    expect(number(null)).toBe('—'); expect(metric(null, '%')).toBe('—')
    expect(metric(0, '%')).toBe('0%'); expect(temp(-2)).toBe('-2°')
  })
  it('uses the location timezone instead of the computer timezone', () => {
    expect(localTime('2026-10-24T01:00:00Z', 'America/Mexico_City')).toBe('19:00')
    expect(localTime(null)).toBe('—')
  })
  it('maps compass bearings with Spanish west labels', () => {
    expect(windDirection(0)).toBe('N'); expect(windDirection(360)).toBe('N')
    expect(windDirection(90)).toBe('E'); expect(windDirection(270)).toBe('O')
    expect(windDirection(315)).toBe('NO'); expect(windDirection(null)).toContain('Sin dirección')
  })
  it('selects local weather icons and preserves unknown conditions', () => {
    expect(weatherFamily(1000)).toBe('clear'); expect(weatherFamily(1276)).toBe('storm')
    expect(weatherFamily(1225)).toBe('snow'); expect(weatherFamily(null)).toBe('unknown')
  })
})
