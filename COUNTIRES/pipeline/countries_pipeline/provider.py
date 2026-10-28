import base64
import logging
import struct
import time
from concurrent.futures import ThreadPoolExecutor

import httpx

from .errors import MissingCountryCodes, PipelineError
from .transform import normalize_country

API_URL = 'https://api.restcountries.com/countries/v5'
FLAG_ORIGIN = 'https://flags.restcountries.com'
FIELDS = 'names,codes,region,subregion,capitals,population,area,languages,currencies,timezones,borders,continents,calling_codes,tlds,coordinates,classification'
MAX_FLAG_BYTES = 256_000
logger = logging.getLogger(__name__)


def check_status(status):
    if status == 401:
        raise PipelineError('REST Countries rechazó la clave API. Revisa RESTCOUNTRIES_API_KEY en pipeline/.env y reinicia Airflow.')
    if status == 403:
        raise PipelineError('REST Countries denegó el acceso. Revisa el estado y la cuota de tu cuenta.')
    if status == 410:
        raise PipelineError('La versión de REST Countries ya no está disponible. Revisa la configuración del proveedor.')
    if status == 429 or status >= 500:
        raise PipelineError('REST Countries no está disponible temporalmente o limitó las solicitudes.', retryable=True)
    if not 200 <= status < 300:
        raise PipelineError('REST Countries no pudo completar la descarga del catálogo.')


class Provider:
    def __init__(self, client: httpx.Client, key: str):
        self.client, self.key = client, key

    def countries(self):
        records, offset, total = [], 0, None
        excluded_names = set()
        try:
            for _ in range(5):
                response = self.client.get(API_URL, params={'limit': 100, 'offset': offset, 'response_fields': FIELDS},
                                           headers={'Authorization': f'Bearer {self.key}'})
                check_status(response.status_code)
                payload = response.json()
                data = payload.get('data', {})
                if '_demo' in data:
                    raise PipelineError('La clave demo de REST Countries sólo devuelve una muestra. Configura una clave propia.')
                items, meta = data.get('objects'), data.get('meta', {})
                page_total = meta.get('total')
                if isinstance(page_total, bool) or not isinstance(page_total, int) or not 200 <= page_total <= 400:
                    raise PipelineError('REST Countries devolvió un catálogo incompleto. No se reemplazaron los datos anteriores.')
                if total is not None and total != page_total:
                    raise PipelineError('El catálogo cambió durante la descarga. Se volverá a intentar.', retryable=True)
                total = page_total
                if not isinstance(items, list) or not items or len(items) > 100 or meta.get('offset', offset) != offset:
                    raise PipelineError('La paginación de REST Countries no es válida.')
                for item in items:
                    try:
                        records.append(normalize_country(item))
                    except MissingCountryCodes:
                        name = item['names']['common'].strip()
                        if name in excluded_names:
                            raise PipelineError('La descarga contiene registros sin códigos duplicados.')
                        excluded_names.add(name)
                offset += len(items)
                logger.info('Country catalog page validated (%s/%s provider records).', offset, total)
                if offset == total:
                    break
                if offset > total:
                    raise PipelineError('REST Countries devolvió países duplicados o páginas no válidas.')
            if (offset != total or len(records) + len(excluded_names) != total or len(records) < 200
                or len({c['code'] for c in records}) != len(records)
                or len({c['alpha2'] for c in records}) != len(records)):
                raise PipelineError('La descarga del catálogo está incompleta o contiene códigos duplicados.')
            if excluded_names:
                logger.warning('Country catalog coverage: %s records without ISO codes excluded; %s supported records.',
                               len(excluded_names), len(records))
            return records
        except (httpx.HTTPError, ValueError, TypeError, AttributeError, KeyError):
            raise PipelineError('No se pudo leer el catálogo de REST Countries. Se volverá a intentar.', retryable=True) from None

    def flag(self, alpha2: str):
        # Never follow a URL from provider data. No API Authorization is sent to the flag host.
        if len(alpha2) != 2 or not alpha2.isascii() or not alpha2.isalpha():
            raise PipelineError('Código no válido para descargar la bandera.')
        url = f'{FLAG_ORIGIN}/v5/w320/{alpha2.lower()}.png'
        for attempt in range(3):
            try:
                with self.client.stream('GET', url) as response:
                    check_status(response.status_code)
                    content = bytearray()
                    for chunk in response.iter_bytes():
                        content.extend(chunk)
                        if len(content) > MAX_FLAG_BYTES:
                            raise PipelineError('Una bandera excedió el tamaño permitido. Se conservó el catálogo anterior.')
                if len(content) < 33 or content[:8] != b'\x89PNG\r\n\x1a\n' or content[12:16] != b'IHDR':
                    raise PipelineError('El proveedor devolvió una bandera que no es un PNG válido.')
                width, height = struct.unpack('>II', content[16:24])
                if not 1 <= width <= 640 or not 1 <= height <= 640:
                    raise PipelineError('El tamaño de una bandera no es válido.')
                return base64.b64encode(content).decode('ascii')
            except httpx.HTTPError:
                problem = PipelineError('No se pudo descargar una bandera. Se conservó el catálogo anterior.', retryable=True)
            except PipelineError as error:
                problem = error
            if not problem.retryable or attempt == 2:
                raise problem from None
            time.sleep(0.3 * (attempt + 1))

    def snapshot(self):
        countries = self.countries()
        logger.info('Downloading flags for %s supported countries.', len(countries))
        with ThreadPoolExecutor(max_workers=4) as pool:
            flags = pool.map(self.flag, [c['alpha2'] for c in countries])
            for country, flag in zip(countries, flags, strict=True):
                country['flag_png_base64'] = flag
        logger.info('Country flags validated (%s images).', len(countries))
        return countries
