import { countryName, flagSource, number, regionLabel } from '../lib/format.js'
import Icon from './Icon.jsx'

export default function CountryCard({ country, onSelect }) {
  return <button className="country-card" onClick={() => onSelect(country)} aria-label={`Explorar ${countryName(country)}`}>
    <div className={`flag-stage region-${country.region.toLowerCase()}`}>
      <img src={flagSource(country)} alt={`Bandera de ${countryName(country)}`} loading="lazy" width="320" height="200"/>
      <span className="country-code">{country.alpha2}</span>
    </div>
    <div className="country-card-body">
      <span className="region-label"><span/>{regionLabel(country.region)}</span>
      <h3>{countryName(country)}</h3>
      <p className="capital"><Icon name="pin" size={14}/><span>{country.capitals.length ? country.capitals.join(', ') : 'Capital no disponible'}</span></p>
      <div className="card-bottom"><span><Icon name="people" size={15}/>{number(country.population)}<span className="sr-only"> habitantes</span></span><span className="card-arrow"><Icon name="arrow" size={17}/></span></div>
    </div>
  </button>
}
