// Deliberately synthetic; imported only by tests and the separate /qa/ page.
export const location = { id: '22222222-2222-4222-8222-222222222222', provider_id: 1,
  name: 'Ciudad de México', region: 'CDMX', country: 'México', latitude: 19.43, longitude: -99.13, timezone: 'America/Mexico_City' }
const current = { temp_c: 22, feelslike_c: 24, condition_code: 1003, condition_text: 'Parcialmente nublado', is_day: true,
  pressure_hpa: 1014, humidity: 62, cloud: 35, wind_kph: 12.6, wind_degree: 315, gust_kph: 21.2,
  uv: 5, observed_at: '2026-10-23T18:00:00Z', fetched_at: '2026-10-23T18:05:00Z' }
const descriptions = ['Parcialmente nublado', 'Lluvia moderada', 'Soleado']
const codes = [1003, 1189, 1000]
export const bundle = { location, current, stale: false, days: [], hours: [] }
for (let i = 0; i < 3; i++) {
  const date = `2026-10-${23 + i}`
  bundle.days.push({ forecast_date: date, min_temp_c: 14 - i, max_temp_c: 26 - i,
    condition_code: codes[i], condition_text: descriptions[i], sunrise: `${date}T12:31:00Z`, sunset: `${date}T18:12:00-06:00`,
    moon_phase: 'Waxing Gibbous', moon_illumination: 88.4 + i })
  for (let hour = 0; hour < 24; hour++) {
    const forecast_at = new Date(`${date}T00:00:00-06:00`).getTime() + hour * 3600000
    const daylight = Math.max(0, Math.sin((hour - 6) / 12 * Math.PI))
    bundle.hours.push({ ...current, forecast_at: new Date(forecast_at).toISOString(), forecast_date: date,
      temp_c: Math.round(15 + daylight * 10 - i), feelslike_c: Math.round(16 + daylight * 11 - i),
      condition_code: codes[i], condition_text: descriptions[i], is_day: hour >= 7 && hour < 19,
      uv: Math.round(daylight * (8 - i) * 10) / 10 })
  }
}
export const recent = [{ location: { ...location, current }, selected_at: current.fetched_at },
  { location: { ...location, id: '44444444-4444-4444-8444-444444444444', name: 'Guadalajara', region: 'Jalisco', current: { ...current, temp_c: 26, condition_code: 1000 } }, selected_at: current.fetched_at },
  { location: { ...location, id: '55555555-5555-4555-8555-555555555555', name: 'Monterrey', region: 'Nuevo León', current: { ...current, temp_c: 29, condition_code: 1006 } }, selected_at: current.fetched_at }]
