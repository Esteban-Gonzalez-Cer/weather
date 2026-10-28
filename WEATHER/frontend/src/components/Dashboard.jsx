import { useEffect, useState } from 'react'
import { dayLabel, localDate, localTime, metric, moonPhases, number, temp, windDirection } from '../format.js'
import { Cloudscape, Icon, WeatherIcon } from './Icons.jsx'

function UVChart({ hours, zone, selectedHour }) {
  const width = Math.max(620, hours.length * 38)
  const max = Math.max(12, ...hours.map(h => h.uv || 0))
  const x = i => 22 + i * (width - 44) / Math.max(1, hours.length - 1)
  const y = value => 90 - value / max * 58
  let drawing = '', previous = false
  hours.forEach((hour, i) => {
    if (hour.uv == null) { previous = false; return }
    drawing += `${previous ? 'L' : 'M'}${x(i)},${y(hour.uv)} `; previous = true
  })
  return <section className="panel uv-panel" aria-labelledby="uv-heading"><div className="section-title"><h2 id="uv-heading">La luz del día</h2><span className="small-label">Índice UV · por hora</span></div>
    {hours.length ? <div className="uv-scroll" tabIndex="0" role="region" aria-label="Gráfica de UV por hora, desplazamiento horizontal"><svg viewBox={`0 0 ${width} 129`} style={{ minWidth: width }} role="img" aria-label="Pronóstico del índice UV. Los guiones indican datos no disponibles.">
      <path d={`M18 90H${width - 18}`} stroke="var(--line)"/>
      <path d={drawing} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round"/>
      {hours.map((h, i) => <g key={h.forecast_at}>
        <title>{localTime(h.forecast_at, zone)} · UV {number(h.uv, 1)}</title>
        {h.uv != null && <><path d={`M${x(i)} 90V${y(h.uv)}`} stroke="var(--accent)" opacity=".13" strokeWidth="13"/><circle cx={x(i)} cy={y(h.uv)} r={selectedHour === h.forecast_at ? 5 : 3} fill="var(--accent)"/></>}
        <text x={x(i)} y={h.uv == null ? 76 : y(h.uv) - 11} textAnchor="middle" className="uv-value">{number(h.uv, 1)}</text>
        <text x={x(i)} y="116" textAnchor="middle" className="uv-time">{localTime(h.forecast_at, zone)}</text>
      </g>)}
    </svg></div> : <p className="muted">No hay datos de UV para este día.</p>}
  </section>
}

function WindCompass({ data }) {
  return <section className="panel wind-panel" aria-labelledby="wind-heading"><div className="section-title"><h2 id="wind-heading">De dónde viene el viento</h2><Icon name="wind"/></div>
    <div className="wind-layout"><div className="wind-reading"><strong>{number(data?.wind_kph, 1)}<small> km/h</small></strong><span>{data?.wind_degree == null ? 'Dirección no disponible' : `Desde el ${windDirection(data.wind_degree)} · ${number(data.wind_degree)}°`}</span><div className="wind-gust">Ráfagas <b>{metric(data?.gust_kph, ' km/h', 1)}</b></div></div>
      <svg className="compass" viewBox="0 0 160 160" role="img" aria-label={data?.wind_degree == null ? 'Dirección del viento no disponible' : `Viento desde ${windDirection(data.wind_degree)}, ${number(data.wind_degree)} grados`}>
        <circle cx="80" cy="80" r="53" fill="none" stroke="var(--line)"/><circle cx="80" cy="80" r="39" fill="none" stroke="var(--line)" strokeDasharray="1 6"/>
        {[0, 45, 90, 135].map(angle => <path key={angle} d="M80 27v106" transform={`rotate(${angle} 80 80)`} stroke="var(--line)"/>)}
        <text x="80" y="18">N</text><text x="146" y="84">E</text><text x="80" y="150">S</text><text x="14" y="84">O</text>
        {data?.wind_degree != null && <g transform={`rotate(${data.wind_degree} 80 80)`}><path d="m80 36-10 46 10-7 10 7Z" fill="var(--accent)"/><path d="m80 122-10-40 10 7 10-7Z" fill="#86918b" opacity=".5"/></g>}
        <circle cx="80" cy="80" r="5" fill="var(--panel-solid)" stroke="var(--accent)"/>
      </svg>
    </div>
  </section>
}

function Moon({ phase }) {
  const index = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'].indexOf(phase)
  const flip = index > 4 ? -1 : 1
  const shape = index === 4 ? 'M32 6a26 26 0 1 1 0 52 26 26 0 1 1 0-52' : index === 0 || index === -1 ? '' : `M32 6a26 26 0 0 1 0 52 ${[1, 7].includes(index) ? '21 26 0 0 0' : [3, 5].includes(index) ? '21 26 0 0 1' : '0 0 0 0 1'} 0-52`
  return <svg className="moon-disc" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26" fill="#3a4544"/><g transform={`translate(${flip === -1 ? 64 : 0} 0) scale(${flip} 1)`}><path d={shape} fill="#d4dcce"/></g><circle cx="23" cy="20" r="3" fill="#26322d" opacity=".14"/><circle cx="42" cy="38" r="6" fill="#26322d" opacity=".13"/></svg>
}

function Astronomy({ day, zone }) {
  return <section className="panel astronomy-panel" aria-labelledby="astro-heading"><div className="section-title"><h2 id="astro-heading">El sol y la luna</h2><span className="small-label">{day?.forecast_date ? dayLabel(day.forecast_date) : 'Sin datos'}</span></div>
    <div className="sun-times"><div><Icon name="sunrise" size={26}/><span>Amanecer</span><strong>{localTime(day?.sunrise, zone)}</strong></div><div><Icon name="sunset" size={26}/><span>Atardecer</span><strong>{localTime(day?.sunset, zone)}</strong></div></div>
    <div className="moon-row"><Moon phase={day?.moon_phase}/><div><strong>{moonPhases[day?.moon_phase] || 'Fase no disponible'}</strong><span>{metric(day?.moon_illumination, '%', 1)} de iluminación</span></div></div>
  </section>
}

export default function Dashboard({ bundle, recent, onSelect, onSearch }) {
  const { current, days, hours, location } = bundle
  const [dayDate, setDayDate] = useState(days[0]?.forecast_date)
  const [hourStamp, setHourStamp] = useState(null)
  useEffect(() => { setDayDate(days[0]?.forecast_date); setHourStamp(null) }, [location.id])
  const day = days.find(d => d.forecast_date === dayDate) || days[0]
  const dayHours = hours.filter(h => h.forecast_date === day?.forecast_date)
  const selectedHour = dayHours.find(h => h.forecast_at === hourStamp)
  const details = selectedHour || current
  const zone = location.timezone || 'UTC'
  const today = days[0]
  const stats = [
    ['drop', 'Humedad', metric(details?.humidity, '%')],
    ['gauge', 'Presión', metric(details?.pressure_hpa, ' hPa')],
    ['cloud', 'Nubosidad', metric(details?.cloud, '%')],
  ]

  return <div className="dashboard-grid">
    <div className="main-column">
      <section className="hero panel"><Cloudscape/><div className="hero-content"><div className="hero-top"><span className="pill"><span className="status-dot"/>Ahora</span><span className="hero-observed">Observado a las {localTime(current?.observed_at, zone)}</span></div>
        <div className="hero-reading"><div><div className="hero-temperature">{temp(current?.temp_c)}</div><h1>{current?.condition_text || 'Condición no disponible'}</h1><p>Sensación de {temp(current?.feelslike_c)}</p></div><WeatherIcon code={current?.condition_code} isDay={current?.is_day} size={178}/></div>
        <div className="hero-bottom"><div className="high-low"><span><small>MÁX.</small> {temp(today?.max_temp_c)}</span><span><small>MÍN.</small> {temp(today?.min_temp_c)}</span></div><span className="hero-caption">Un vistazo al cielo.<br/>Un paso por delante.</span></div>
      </div></section>

      <section className="forecast-section" aria-labelledby="forecast-heading"><div className="section-title"><h2 id="forecast-heading">Los próximos días</h2><span className="small-label">Hoy y dos días más</span></div>
        <div className="day-grid">{days.map((forecast, i) => <button key={forecast.forecast_date} className={`day-card ${day?.forecast_date === forecast.forecast_date ? 'selected' : ''}`} aria-pressed={day?.forecast_date === forecast.forecast_date} onClick={() => {
          setDayDate(forecast.forecast_date)
          const middle = hours.find(h => h.forecast_date === forecast.forecast_date && localTime(h.forecast_at, zone) === '12:00')
          setHourStamp(i === 0 ? null : middle?.forecast_at || null)
        }}><span className="day-name">{i === 0 ? 'Hoy' : dayLabel(forecast.forecast_date)}</span><WeatherIcon code={forecast.condition_code} size={58}/><span className="day-temperatures">{temp(forecast.max_temp_c)} <small>{temp(forecast.min_temp_c)}</small></span><span className="day-condition">{forecast.condition_text || 'Sin datos'}</span></button>)}</div>
      </section>

      <section className="panel hourly-panel" aria-labelledby="hourly-heading"><div className="section-title"><div><h2 id="hourly-heading">Hora a hora</h2><span className="small-label">{day?.forecast_date ? dayLabel(day.forecast_date) : 'Sin datos'} · selecciona una hora</span></div><button className="text-button" onClick={() => { setHourStamp(null); setDayDate(days[0]?.forecast_date) }}>Ahora <Icon name="arrow" size={15}/></button></div>
        <div className="hourly-scroll">{dayHours.map(hour => <button key={hour.forecast_at} className={`hour-card ${hourStamp === hour.forecast_at ? 'selected' : ''}`} aria-pressed={hourStamp === hour.forecast_at} aria-label={`${localTime(hour.forecast_at, zone)}, ${temp(hour.temp_c)}, ${hour.condition_text || 'sin condición'}`} onClick={() => setHourStamp(hour.forecast_at)}><span>{localTime(hour.forecast_at, zone)}</span><WeatherIcon code={hour.condition_code} isDay={hour.is_day} size={48}/><strong>{temp(hour.temp_c)}</strong></button>)}</div>
        {!dayHours.length && <p className="muted">No hay un pronóstico horario disponible para este día.</p>}
      </section>
      <UVChart hours={dayHours} zone={zone} selectedHour={hourStamp}/>
      <div className="data-credit"><span>Datos de WeatherAPI.com</span><span>Hora local · {zone}</span></div>
    </div>

    <aside className="detail-column" aria-label="Detalles del clima">
      <section className="panel conditions-panel"><div className="section-title"><h2>{selectedHour ? 'Detalle del pronóstico' : 'Condiciones actuales'}</h2><Icon name="gauge"/></div><div className="details-context">{selectedHour ? `${dayLabel(selectedHour.forecast_date)} · ${localTime(selectedHour.forecast_at, zone)}` : 'Lo que se siente afuera'}<span className={`mini-badge ${selectedHour ? '' : 'live'}`}>{selectedHour ? 'Pronóstico' : 'Ahora'}</span></div>
        <div className="feels-reading"><span>Sensación térmica</span><strong>{temp(details?.feelslike_c)}</strong></div>
        {selectedHour && <div className="forecast-summary"><span>{selectedHour.condition_text || 'Sin condición disponible'}</span><b>{temp(selectedHour.temp_c)}</b></div>}
        <div className="stat-grid">{stats.map(([icon, title, value]) => <div className="stat" key={title}><Icon name={icon}/><strong>{value}</strong><span>{title}</span></div>)}</div>
      </section>
      <WindCompass data={details}/>
      <Astronomy day={day} zone={zone}/>
      <section className="panel recent-panel" aria-labelledby="recent-heading"><div className="section-title"><h2 id="recent-heading">Tus últimos destinos</h2><button className="icon-button" aria-label="Buscar otra ciudad" onClick={onSearch}><Icon name="search" size={18}/></button></div>
        <div className="recent-list">{recent.map(({ location: loc }) => <button key={loc.id} className={`recent-city ${loc.id === location.id ? 'active' : ''}`} onClick={() => onSelect(loc)}><WeatherIcon code={loc.current?.condition_code} isDay={loc.current?.is_day} size={43}/><span><strong>{loc.name}</strong><small>{loc.country}</small></span><b>{temp(loc.current?.temp_c)}</b></button>)}</div>
        {!recent.length && <p className="muted">Las ciudades que elijas aparecerán aquí.</p>}
      </section>
    </aside>
  </div>
}
