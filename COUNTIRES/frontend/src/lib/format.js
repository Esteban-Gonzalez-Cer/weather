export const regionLabels = { Africa: 'África', Americas: 'América', Asia: 'Asia', Europe: 'Europa', Oceania: 'Oceanía', Antarctic: 'Antártida', Antarctica: 'Antártida', 'North America': 'América del Norte', 'South America': 'América del Sur' }
export const regionLabel = value => regionLabels[value] || value
export const countryName = country => country.spanish_name || country.name
export const number = value => value == null ? 'No disponible' : new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 }).format(value)
export const flagSource = country => country.flag_png_base64 ? `data:image/png;base64,${country.flag_png_base64}` : undefined
export function dateTime(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'Pendiente de la primera carga'
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
