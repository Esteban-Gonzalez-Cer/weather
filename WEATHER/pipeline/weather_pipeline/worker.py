import logging
import os
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

from .transform import transform_forecast, transform_search

logger = logging.getLogger(__name__)

PROVIDER_ACCOUNT_ERRORS = {
    1002: 'WeatherAPI (1002): falta la API key. Configura WEATHERAPI_KEY en pipeline/.env.',
    2006: 'WeatherAPI (2006): la API key no es válida. Revisa WEATHERAPI_KEY en pipeline/.env.',
    2007: 'WeatherAPI (2007): se agotó la cuota mensual de la cuenta. Revisa tu plan y el próximo reinicio de cuota.',
    2008: 'WeatherAPI (2008): la API key está deshabilitada. Revisa su estado en tu cuenta de WeatherAPI.',
    2009: 'WeatherAPI (2009): tu plan no permite este recurso. Revisa el acceso de tu suscripción.',
}


class PipelineError(Exception):
    def __init__(self, message, retryable=False, retry_after=30):
        super().__init__(message)
        self.retryable, self.retry_after = retryable, retry_after


class Services:
    def __init__(self):
        load_dotenv(Path(__file__).resolve().parents[1] / '.env')
        self.url = os.environ.get('SUPABASE_URL', '').rstrip('/')
        self.key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
        self.weather_key = os.environ.get('WEATHERAPI_KEY', '')
        if not self.url.startswith('https://') or not self.key or not self.weather_key or any(
            'YOUR_' in value for value in (self.url, self.key, self.weather_key)
        ):
            raise PipelineError('Configura las credenciales del pipeline en su archivo .env.')
        self.client = httpx.Client(timeout=httpx.Timeout(20, connect=5), follow_redirects=False)
        # httpx INFO logs contain the WeatherAPI query string, including the API key.
        logging.getLogger('httpx').setLevel(logging.WARNING)

    def close(self):
        self.client.close()

    def rpc(self, name, payload):
        headers = {'apikey': self.key}
        if not self.key.startswith('sb_secret_'):
            headers['Authorization'] = f'Bearer {self.key}'
        try:
            response = self.client.post(f'{self.url}/rest/v1/rpc/{name}', headers=headers, json=payload)
            response.raise_for_status()
            return response.json() if response.content else None
        except (httpx.HTTPError, ValueError):
            raise PipelineError('No se pudo completar la operación en Supabase.', retryable=True) from None

    def location(self, location_id):
        # weather_bundle is read through the same Supabase RPC, never another weather source.
        bundle = self.rpc('weather_bundle', {'p_location_id': location_id})
        if not bundle:
            raise PipelineError('La ubicación ya no está disponible.')
        return bundle['location']

    def provider(self, endpoint, **params):
        try:
            response = self.client.get(f'https://api.weatherapi.com/v1/{endpoint}.json',
                                       params={'key': self.weather_key, **params})
            try:
                body = response.json()
            except ValueError:
                raise PipelineError('El proveedor devolvió datos no válidos.', retryable=True) from None
            error = body.get('error', {}) if isinstance(body, dict) else {}
            code = error.get('code')
            if code in PROVIDER_ACCOUNT_ERRORS:
                # Use our fixed messages; provider text may contain credentials.
                logger.warning('WeatherAPI rejected request (code=%s).', code)
                raise PipelineError(PROVIDER_ACCOUNT_ERRORS[code])
            if response.status_code == 429:
                try:
                    delay = int(response.headers.get('retry-after', '60'))
                except ValueError:
                    delay = 60
                raise PipelineError('El proveedor está limitando las solicitudes.', True, delay)
            if response.status_code >= 500:
                raise PipelineError('El proveedor no está disponible temporalmente.', True)
            if response.is_error or error:
                raise PipelineError('El proveedor no pudo resolver esta solicitud.')
            return body
        except httpx.HTTPError:
            # Never propagate an HTTP exception containing the keyed provider URL.
            raise PipelineError('No se pudo conectar con el proveedor.', True) from None


def process_queue(services=None, max_jobs=10, max_seconds=45):
    owned = services is None
    services = services or Services()
    processed, started = 0, time.monotonic()
    try:
        while processed < max_jobs and time.monotonic() - started < max_seconds:
            job = services.rpc('claim_ingestion_job', {})
            if not job:
                break
            args = {'p_job_id': job['id'], 'p_lease': job['lease_token']}
            try:
                if not services.rpc('resolve_cached_job', args):
                    if job['kind'] == 'search':
                        data = transform_search(services.provider('search', q=job['query']))
                        services.rpc('publish_search', {**args, 'p_locations': data})
                    else:
                        location = services.location(job['location_id'])
                        payload = services.provider('forecast', q=f"id:{location['provider_id']}", days=3, lang='es', aqi='no', alerts='no')
                        data = transform_forecast(payload)
                        services.rpc('publish_weather', {**args, 'p_payload': data})
                logger.info('Ingestion job %s completed', job['id'])
            except (ValueError, KeyError, TypeError):
                services.rpc('fail_ingestion_job', {**args, 'p_error': 'El proveedor devolvió un pronóstico incompleto o no válido.',
                                                    'p_retryable': True, 'p_retry_after': 30 * 2 ** (job['attempts'] - 1)})
            except PipelineError as error:
                services.rpc('fail_ingestion_job', {**args, 'p_error': str(error),
                                                    'p_retryable': error.retryable,
                                                    'p_retry_after': max(error.retry_after, 30 * 2 ** (job['attempts'] - 1))})
            processed += 1
        return processed
    finally:
        if owned:
            services.close()


def refresh_locations():
    services = Services()
    try:
        return services.rpc('enqueue_weather_refreshes', {})
    finally:
        services.close()
