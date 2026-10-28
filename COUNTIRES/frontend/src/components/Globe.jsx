import { useId } from 'react'

// Decorative illustration, built locally; no map/asset service is queried.
export default function Globe({ className = '' }) {
  const id = useId().replaceAll(':', '')
  return <svg className={`globe-art ${className}`} viewBox="0 0 560 430" fill="none" aria-hidden="true">
    <defs>
      <radialGradient id={`${id}-sphere`} cx=".28" cy=".2" r=".9"><stop stopColor="#c5e5ff"/><stop offset=".5" stopColor="#9da3f4"/><stop offset="1" stopColor="#6851d1"/></radialGradient>
      <linearGradient id={`${id}-land`} x1="120" y1="90" x2="400" y2="350" gradientUnits="userSpaceOnUse"><stop stopColor="white"/><stop offset="1" stopColor="#dedcff"/></linearGradient>
      <radialGradient id={`${id}-shine`}><stop stopColor="white" stopOpacity=".6"/><stop offset="1" stopColor="white" stopOpacity="0"/></radialGradient>
      <pattern id={`${id}-dots`} width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="3.5" cy="3.5" r="2.5" fill={`url(#${id}-land)`}/></pattern>
      <clipPath id={`${id}-clip`}><circle cx="280" cy="212" r="165"/></clipPath>
      <filter id={`${id}-shadow`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="12"/></filter>
    </defs>
    <ellipse cx="281" cy="391" rx="130" ry="12" fill="#7969cd" opacity=".13" filter={`url(#${id}-shadow)`}/>
    <circle cx="280" cy="212" r="200" stroke="white" strokeWidth="26" opacity=".35"/>
    <circle cx="280" cy="212" r="182" stroke="white" strokeWidth="2" opacity=".5"/>
    <circle cx="280" cy="212" r="165" fill={`url(#${id}-sphere)`}/>
    <g clipPath={`url(#${id}-clip)`} fill={`url(#${id}-dots)`}>
      <path d="m117 133 27-28 29-11 21-20 29-4 7 19-21 14-5 15 12 9-9 20-22 2-3 22-16 8-5 18-19-8-8-26-16-3-12-12Zm49 67 21-2 9 15 20 10 5 13-15 4-15-13-13-10Zm49 38 23 7 15 25-5 26-17 18-10 32-13-3-8-34-10-14 3-25 7-14Z"/>
      <path d="m227 64 32-16 24 10-7 26-15 19-19-3-9-16Zm61 59 16-17 20-1 4-12 29 1 18-12 26 8 21 25 21 7 12 35-19 14-25-7-21 7-5 19-24-7-13-15-15 7-18-12-13-2-6-18-11-2Zm9 47 30 3 20 11 11 25-10 20-7 33-20 26-10-7-6-28-15-20-6-30Zm66 25 19-10 14 13 14 6 9 20-8 7-21-5-13-14Zm34 71 21-11 23 11 10 26-17 9-23-9-19-3Zm-40-21 7 10-5 18-7-4Z"/>
      <path d="m130 353 46 7 30-5 33 8 36-5 34 1 20-9 32 3 41-8 13 19-34 25-92 13-72-10-49-18Z"/>
    </g>
    <circle cx="222" cy="131" r="95" fill={`url(#${id}-shine)`}/>
    <ellipse cx="280" cy="212" rx="223" ry="75" stroke="#8c72e4" strokeWidth="1" strokeDasharray="4 7" transform="rotate(-24 280 212)" opacity=".45"/>
    <path d="M142 183q95-104 225-2" stroke="#7451de" strokeWidth="2" strokeDasharray="4 5"/>
    <circle cx="145" cy="180" r="6" fill="#7451de" stroke="white" strokeWidth="3"/><circle cx="368" cy="181" r="6" fill="#7451de" stroke="white" strokeWidth="3"/>
    <circle cx="421" cy="307" r="5" fill="#5bbce8"/><circle cx="88" cy="152" r="5" fill="#aa9bea"/>
  </svg>
}
