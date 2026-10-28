import logging
import re

import httpx

from .config import Settings
from .errors import PipelineError

logger = logging.getLogger(__name__)


class Database:
    def __init__(self, client: httpx.Client, settings: Settings):
        self.client = client
        self.url = settings.supabase_url + '/rest/v1/rpc/'
        # sb_secret_ keys authenticate at the gateway; they are not JWTs.
        self.headers = {'apikey': settings.service_key}
        if not settings.service_key.startswith('sb_secret_'):
            self.headers['Authorization'] = f'Bearer {settings.service_key}'

    def rpc(self, name, payload=None):
        try:
            response = self.client.post(self.url + name, headers=self.headers, json=payload or {})
            if response.is_error:
                try:
                    body = response.json()
                    code = str(body.get('code', 'unknown')) if isinstance(body, dict) else 'unknown'
                except ValueError:
                    code = 'unknown'
                if not re.fullmatch(r'[A-Za-z0-9_]{1,32}', code):
                    code = 'unknown'
                logger.warning('Supabase RPC rejected (operation=%s; status=%s; code=%s).',
                               name, response.status_code, code)
                if response.status_code in (401, 403):
                    raise PipelineError('Supabase rechazó las credenciales del pipeline. Revisa su clave privilegiada y reinicia Airflow.')
                raise PipelineError(f'Supabase no pudo guardar la carga (código {code}). Revisa las migraciones y vuelve a intentar.',
                                    retryable=response.status_code >= 500 or response.status_code == 429)
            # PostgREST returns an empty successful response for void RPCs.
            if response.status_code == 204 or name == 'schedule_catalog_refresh' and not response.content:
                return None
            return response.json()
        except (httpx.HTTPError, ValueError):
            raise PipelineError('No se pudo conectar con Supabase. Se conservaron los datos anteriores.', retryable=True) from None
