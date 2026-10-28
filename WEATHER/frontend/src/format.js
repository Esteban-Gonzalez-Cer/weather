export function number(value, digits = 0) {
  return value == null || !Number.isFinite(Number(value)) ? '—' : new Intl.NumberFormat('es-MX', { maximumFractionDigits: digits }).format(value)
}
export const temp = value => `${number(value)}°`
export const metric = (value, unit, digits = 0) => value == null ? '—' : `${number(value, digits)}${unit}`

export function localTime(value, zone = 'UTC') {
  return value ? new Intl.DateTimeFormat('es-MX', { timeZone: zone || 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value)) : '—'
}
export function localDate(value, zone = 'UTC', options = {}) {
  return value ? new Intl.DateTimeFormat('es-MX', { timeZone: zone || 'UTC', weekday: 'long', day: 'numeric', month: 'long', ...options }).format(new Date(value)) : '—'
}
export function dayLabel(date) {
  return new Intl.DateTimeFormat('es-MX', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
}
export function windDirection(degree) {
  if (degree == null) return 'Sin dirección disponible'
  const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO']
  return names[Math.round((((degree % 360) + 360) % 360) / 22.5) % 16]
}
export const moonPhases = {
  'New Moon': 'Luna nueva', 'Waxing Crescent': 'Luna creciente', 'First Quarter': 'Cuarto creciente',
  'Waxing Gibbous': 'Gibosa creciente', 'Full Moon': 'Luna llena', 'Waning Gibbous': 'Gibosa menguante',
  'Last Quarter': 'Cuarto menguante', 'Waning Crescent': 'Luna menguante',
}
