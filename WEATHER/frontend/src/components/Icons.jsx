import { useId } from 'react'

const paths = {
  home: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  search: 'M21 21l-5.2-5.2M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  wind: 'M3 8h12a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h5a3 3 0 1 1-3 3',
  drop: 'M12 2S4 11 4 15a8 8 0 0 0 16 0c0-4-8-13-8-13Z',
  gauge: 'M4 19a10 10 0 1 1 16 0M12 13l5-5M7 17h10',
  cloud: 'M6 18a5 5 0 0 1-1-10 7 7 0 0 1 13-1 5.5 5.5 0 0 1 0 11Z',
  refresh: 'M20 7v5h-5M4 17v-5h5M19 7a8 8 0 0 0-14-1M5 17a8 8 0 0 0 14 1',
  logout: 'M9 3H4v18h5M10 12h11m-4-4 4 4-4 4',
  close: 'm6 6 12 12M6 18 18 6',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  sunrise: 'M2 20h20M5 16a7 7 0 0 1 14 0M12 2v6m-4-3 4-3 4 3M2 9l3 2m17-2-3 2',
  sunset: 'M2 20h20M5 16a7 7 0 0 1 14 0M12 2v6m-4-3 4 3 4-3M2 9l3 2m17-2-3 2',
  info: 'M12 11v6M12 7h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  check: 'm5 12 4 4L19 6',
}

export function Icon({ name, size = 20, ...props }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name] || paths.info} /></svg>
}

export function weatherFamily(code) {
  if (code == null) return 'unknown'
  if ([1087, 1273, 1276, 1279, 1282].includes(code)) return 'storm'
  if ([1066, 1069, 1072, 1114, 1117, 1168, 1171, 1198, 1201, 1204, 1207, 1210, 1213, 1216, 1219, 1222, 1225, 1237, 1249, 1252, 1255, 1258, 1261, 1264].includes(code)) return 'snow'
  if ([1063, 1150, 1153, 1180, 1183, 1186, 1189, 1192, 1195, 1240, 1243, 1246].includes(code)) return 'rain'
  if ([1030, 1135, 1147].includes(code)) return 'fog'
  if (code === 1000) return 'clear'
  if (code === 1003) return 'partly'
  if ([1006, 1009].includes(code)) return 'cloud'
  return 'unknown'
}

export function WeatherIcon({ code, isDay = true, size = 70, className = '' }) {
  const id = useId().replace(/:/g, '')
  const family = weatherFamily(code)
  const celestial = ['clear', 'partly'].includes(family)
  const cloudy = !['clear', 'unknown'].includes(family)
  return <svg className={`weather-icon ${className}`} width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}sun`} x1="25" y1="12" x2="75" y2="70" gradientUnits="userSpaceOnUse"><stop stopColor="#fff2c6"/><stop offset=".45" stopColor="#ffd170"/><stop offset="1" stopColor="#dc8b36"/></linearGradient>
      <linearGradient id={`${id}cloud`} x1="40" y1="35" x2="57" y2="80" gradientUnits="userSpaceOnUse"><stop stopColor={family === 'storm' ? '#cbd2d5' : '#fffef5'}/><stop offset=".5" stopColor="#d8deda"/><stop offset="1" stopColor={family === 'storm' ? '#727f87' : '#9faaa7'}/></linearGradient>
      <linearGradient id={`${id}moon`} x1="50" y1="15" x2="75" y2="70" gradientUnits="userSpaceOnUse"><stop stopColor="#eee8ff"/><stop offset="1" stopColor="#9d9abd"/></linearGradient>
      <filter id={`${id}shadow`} x="-50%" y="-50%" width="200%" height="220%"><feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#000" floodOpacity=".2"/></filter>
    </defs>
    <g filter={`url(#${id}shadow)`}>
      {celestial && (isDay === false ? <path d="M67 17a27 27 0 1 0 18 39 27 27 0 0 1-18-39Z" fill={`url(#${id}moon)`}/> : <><g stroke="#e8b45b" strokeWidth="2" strokeLinecap="round">{Array.from({ length: 8 }, (_, i) => <path key={i} d="M58 8v5" transform={`rotate(${i * 45} 58 38)`}/>)}</g><circle cx="58" cy="38" r="23" fill={`url(#${id}sun)`}/></>)}
      {cloudy && <path d="M24 73a15 15 0 0 1-2-30 21 21 0 0 1 39-6 18 18 0 0 1 14 36Z" fill={`url(#${id}cloud)`}/>}
      {family === 'rain' && <g fill="#76c9ed"><path d="M29 76s-6 7-6 10a5 5 0 0 0 10 0c0-3-4-10-4-10Z"/><path d="M51 78s-5 6-5 9a4 4 0 0 0 8 0c0-3-3-9-3-9Z"/><path d="M70 76s-5 6-5 9a4 4 0 0 0 8 0c0-3-3-9-3-9Z"/></g>}
      {family === 'storm' && <path d="m47 65-9 20h12l-4 13 21-25H54l5-8Z" fill={`url(#${id}sun)`}/>}
      {family === 'snow' && <g stroke="#c6e8f8" strokeWidth="2" strokeLinecap="round">{[28, 49, 70].map(x => <path key={x} d={`M${x} 80v12m-5-9 10 6m-10 0 10-6`}/>)}</g>}
      {family === 'fog' && <g stroke="#bdc8c5" strokeWidth="4" strokeLinecap="round"><path d="M20 79h61M28 87h45"/></g>}
      {family === 'unknown' && <><circle cx="50" cy="50" r="26" stroke="#87928e" strokeWidth="2" strokeDasharray="3 5"/><text x="50" y="59" fill="#b9c2bc" fontSize="28" textAnchor="middle">?</text></>}
    </g>
  </svg>
}

export function Cloudscape() {
  return <svg className="cloudscape" viewBox="0 0 900 450" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <radialGradient id="sky"><stop stopColor="#88958e"/><stop offset="1" stopColor="#172425"/></radialGradient>
      <filter id="mist"><feTurbulence type="fractalNoise" baseFrequency=".008 .015" numOctaves="5" seed="8"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".55"/></feComponentTransfer><feGaussianBlur stdDeviation="1"/></filter>
      <filter id="soft"><feGaussianBlur stdDeviation="23"/></filter>
    </defs>
    <rect width="900" height="450" fill="url(#sky)"/>
    <g filter="url(#soft)" fill="#a4aca4" opacity=".3"><ellipse cx="640" cy="90" rx="260" ry="80"/><ellipse cx="700" cy="280" rx="220" ry="95"/><ellipse cx="340" cy="205" rx="210" ry="70"/></g>
    <rect width="900" height="450" filter="url(#mist)" opacity=".65"/>
    <g fill="#121e20" opacity=".65" filter="url(#soft)"><ellipse cx="170" cy="130" rx="270" ry="70"/><ellipse cx="410" cy="370" rx="380" ry="70"/></g>
  </svg>
}
