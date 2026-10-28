import logging
import ssl
from dataclasses import dataclass
from functools import lru_cache
from uuid import UUID

import certifi
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientConnectionError
from starlette.concurrency import run_in_threadpool

from .config import Settings, get_settings

bearer = HTTPBearer(auto_error=False)
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Identity:
    user_id: UUID
    token: str


@lru_cache(maxsize=4)
def jwks_client(url: str) -> PyJWKClient:
    # python.org installations on macOS may have no default CA certificates.
    # Keep system/custom trust roots and supplement them with the venv's bundle.
    context = ssl.create_default_context()
    context.load_verify_locations(cafile=certifi.where())
    return PyJWKClient(url, lifespan=300, timeout=8, ssl_context=context)


def verify_token(token: str, settings: Settings) -> Identity:
    try:
        issuer = settings.supabase_url.rstrip('/') + '/auth/v1'
        key = jwks_client(issuer + '/.well-known/jwks.json').get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token, key.key, algorithms=['ES256', 'RS256'], audience='authenticated', issuer=issuer,
            options={'require': ['exp', 'iss', 'sub', 'aud']},
        )
        if claims.get('role') != 'authenticated':
            raise ValueError('Invalid role')
        return Identity(UUID(claims['sub']), token)
    except PyJWKClientConnectionError as error:
        cause = error.__cause__
        reason = getattr(cause, 'reason', cause)
        # Do not log the exception text, request URL, or access token.
        logger.warning('Supabase JWKS connection failed (%s). Check HTTPS certificates and connectivity.',
                       type(reason if reason is not None else error).__name__)
        raise HTTPException(503, 'No se pudo verificar la sesión. Intenta de nuevo.') from None
    except (jwt.PyJWTError, ValueError, KeyError) as error:
        algorithm = 'unknown'
        try:
            candidate = jwt.get_unverified_header(token).get('alg')
            if candidate in {'ES256', 'RS256', 'HS256'}:
                algorithm = candidate
        except jwt.PyJWTError:
            pass
        # Header metadata is diagnostic only; it never authorizes the request.
        logger.warning('Supabase session rejected (%s; signing_algorithm=%s).',
                       type(error).__name__, algorithm)
        raise HTTPException(401, 'Tu sesión no es válida o ha expirado.', headers={'WWW-Authenticate': 'Bearer'}) from None


async def require_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    settings: Settings = Depends(get_settings),
) -> Identity:
    if credentials is None:
        raise HTTPException(401, 'Inicia sesión con Google.', headers={'WWW-Authenticate': 'Bearer'})
    if not settings.configured:
        raise HTTPException(503, 'Configura Supabase en el archivo .env del backend.')
    return await run_in_threadpool(verify_token, credentials.credentials, settings)
