import logging
import re

import httpx
from fastapi import Depends, HTTPException, Request

from .auth import Identity, require_user
from .config import Settings, get_settings

logger = logging.getLogger(__name__)


class Database:
    def __init__(self, client: httpx.AsyncClient, settings: Settings, identity: Identity):
        self.client = client
        self.url = settings.supabase_url.rstrip('/') + '/rest/v1/'
        # Headers belong to this request, never the shared HTTP client's defaults.
        self.headers = {'apikey': settings.supabase_publishable_key, 'Authorization': f'Bearer {identity.token}'}

    async def request(self, method: str, path: str, **kwargs):
        try:
            result = await self.client.request(method, self.url + path, headers=self.headers, **kwargs)
        except httpx.HTTPError:
            raise HTTPException(503, 'No se pudo conectar con la base de datos.') from None
        if result.is_error:
            try:
                error = result.json()
            except ValueError:
                error = {}
            if error.get('code') in {'PT404', 'PT422', 'PT429'}:
                raise HTTPException(int(error['code'][2:]), error.get('message', 'Solicitud no válida.'))
            if result.status_code in {401, 403}:
                code = str(error.get('code') or 'unknown')
                if not re.fullmatch(r'[A-Za-z0-9_]{1,32}', code):
                    code = 'unknown'
                logger.warning('Supabase Data API rejected access (status=%s; code=%s).', result.status_code, code)
                message = str(error.get('message') or '').lower()
                if message in {'invalid api key', 'secret api key required'}:
                    raise HTTPException(503, 'Supabase rechazó la clave de acceso del backend. Revisa su configuración.')
                if result.status_code == 401:
                    raise HTTPException(401, 'Supabase rechazó la sesión al consultar la base de datos.')
                raise HTTPException(403, 'No tienes permiso para consultar estos datos.')
            raise HTTPException(503, 'La base de datos no está disponible o requiere las migraciones.')
        try:
            return result.json()
        except ValueError:
            raise HTTPException(502, 'La base de datos devolvió una respuesta no válida.') from None

    async def rpc(self, name: str, payload: dict):
        return await self.request('POST', f'rpc/{name}', json=payload)


def get_database(request: Request, settings: Settings = Depends(get_settings), identity: Identity = Depends(require_user)) -> Database:
    return Database(request.app.state.http, settings, identity)
