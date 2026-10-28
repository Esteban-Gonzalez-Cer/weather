import asyncio
from datetime import UTC, datetime, timedelta
import ssl
from types import SimpleNamespace
from urllib.error import URLError
from uuid import UUID

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec, rsa
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import auth
from app.auth import Identity, require_user
from app.config import Settings
from app.database import Database, get_database
from app.main import app

USER = UUID('11111111-1111-4111-8111-111111111111')
LOCATION = '22222222-2222-4222-8222-222222222222'
JOB = '33333333-3333-4333-8333-333333333333'


class FakeDatabase:
    def __init__(self):
        self.result = None
        self.calls = []

    async def rpc(self, name, payload):
        self.calls.append((name, payload))
        return self.result

    async def request(self, method, path, **kwargs):
        self.calls.append((method, path, kwargs))
        return self.result


@pytest.fixture
def client():
    app.dependency_overrides.clear()
    with TestClient(app) as value:
        yield value
    app.dependency_overrides.clear()


@pytest.fixture
def database(client):
    db = FakeDatabase()
    app.dependency_overrides[get_database] = lambda: db
    app.dependency_overrides[require_user] = lambda: Identity(USER, 'user-token')
    return db


@pytest.mark.parametrize('method,path,body', [
    ('POST', '/api/v1/searches', {'query': 'Mexico'}),
    ('GET', f'/api/v1/jobs/{JOB}', None),
    ('POST', f'/api/v1/locations/{LOCATION}/select', None),
    ('GET', f'/api/v1/locations/{LOCATION}/weather', None),
    ('GET', '/api/v1/me/recent-locations', None),
])
def test_weather_requires_authentication(client, method, path, body):
    response = client.request(method, path, json=body)
    assert response.status_code == 401
    assert response.headers['www-authenticate'] == 'Bearer'


def test_cached_search_and_queued_search(client, database):
    database.result = {'status': 'completed', 'results': []}
    assert client.post('/api/v1/searches', json={'query': ' Mexico  City '}).status_code == 200
    assert database.calls[-1] == ('submit_search', {'p_query': 'Mexico City'})
    database.result = {'status': 'queued', 'job_id': JOB}
    response = client.post('/api/v1/searches', json={'query': 'Guadalajara'})
    assert response.status_code == 202 and response.json()['job_id'] == JOB


@pytest.mark.parametrize('query', ['', ' ', 'a', 'a' * 101])
def test_invalid_search_is_rejected(client, database, query):
    assert client.post('/api/v1/searches', json={'query': query}).status_code == 422
    assert not database.calls


def test_private_job_is_filtered_by_user_and_missing_is_404(client, database):
    database.result = []
    assert client.get(f'/api/v1/jobs/{JOB}').status_code == 404
    params = database.calls[-1][2]['params']
    assert params['requested_by'] == f'eq.{USER}'
    assert 'lease_token' not in params['select']


def test_invalid_identifier(client, database):
    assert client.get('/api/v1/locations/not-a-uuid/weather').status_code == 422


def test_selection_queues_and_missing_location(client, database):
    database.result = {'status': 'queued', 'job_id': JOB}
    assert client.post(f'/api/v1/locations/{LOCATION}/select').status_code == 202
    database.result = None
    assert client.get(f'/api/v1/locations/{LOCATION}/weather').status_code == 404


def test_health_does_not_require_credentials(client):
    assert client.get('/health').json()['status'] == 'ok'


def test_database_uses_request_identity_and_never_provider():
    requests = []
    def transport(request):
        requests.append(request)
        return httpx.Response(200, json=[])
    async def run():
        settings = Settings(supabase_url='https://test.supabase.co', supabase_publishable_key='public', _env_file=None)
        async with httpx.AsyncClient(transport=httpx.MockTransport(transport)) as client:
            for token in ('alice', 'bob'):
                await Database(client, settings, Identity(USER, token)).rpc('submit_search', {'p_query': 'Paris'})
            assert 'Authorization' not in client.headers
    asyncio.run(run())
    assert [r.headers['Authorization'] for r in requests] == ['Bearer alice', 'Bearer bob']
    assert all(r.url.host == 'test.supabase.co' for r in requests)


def test_database_does_not_expose_sql_errors():
    async def run():
        settings = Settings(supabase_url='https://test.supabase.co', supabase_publishable_key='public', _env_file=None)
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(400, json={'message': 'private SQL statement'}))) as client:
            with pytest.raises(HTTPException) as error:
                await Database(client, settings, Identity(USER, 'token')).rpc('weather_bundle', {})
            assert error.value.status_code == 503
            assert 'SQL statement' not in error.value.detail
    asyncio.run(run())


@pytest.fixture
def signing(monkeypatch):
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    client = SimpleNamespace(get_signing_key_from_jwt=lambda _: SimpleNamespace(key=private.public_key()))
    monkeypatch.setattr(auth, 'jwks_client', lambda _: client)
    settings = Settings(supabase_url='https://test.supabase.co', supabase_publishable_key='public', _env_file=None)
    claims = {'sub': str(USER), 'iss': 'https://test.supabase.co/auth/v1', 'aud': 'authenticated',
              'exp': datetime.now(UTC) + timedelta(minutes=5), 'role': 'authenticated'}
    return private, settings, claims


def test_signed_supabase_token(signing):
    key, settings, claims = signing
    token = jwt.encode(claims, key, algorithm='RS256')
    assert auth.verify_token(token, settings).user_id == USER


@pytest.mark.parametrize('change', [
    {'exp': datetime(2020, 1, 1, tzinfo=UTC)}, {'iss': 'https://attacker.example'},
    {'aud': 'wrong'}, {'role': 'service_role'}, {'sub': 'not-a-uuid'},
])
def test_invalid_token_claims(signing, change):
    key, settings, claims = signing
    token = jwt.encode({**claims, **change}, key, algorithm='RS256')
    with pytest.raises(HTTPException) as error:
        auth.verify_token(token, settings)
    assert error.value.status_code == 401


def test_wrong_signature(signing):
    _, settings, claims = signing
    other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    with pytest.raises(HTTPException):
        auth.verify_token(jwt.encode(claims, other_key, algorithm='RS256'), settings)


def test_jwks_adds_trusted_roots_when_python_has_no_default_ca(monkeypatch):
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    assert context.cert_store_stats()['x509_ca'] == 0
    monkeypatch.setattr(auth.ssl, 'create_default_context', lambda: context)
    auth.jwks_client.cache_clear()
    try:
        client = auth.jwks_client('https://test.supabase.co/auth/v1/.well-known/jwks.json')
        assert client.ssl_context is context
        assert context.cert_store_stats()['x509_ca'] > 0
        assert context.verify_mode == ssl.CERT_REQUIRED
        assert context.check_hostname is True
    finally:
        auth.jwks_client.cache_clear()


def test_jwks_connection_failure_is_503_and_logs_only_error_type(monkeypatch, caplog):
    def fail(_token):
        try:
            raise URLError(ssl.SSLCertVerificationError(1, 'private diagnostic detail'))
        except URLError as cause:
            raise auth.PyJWKClientConnectionError('private URL or diagnostic detail') from cause
    monkeypatch.setattr(auth, 'jwks_client', lambda _: SimpleNamespace(get_signing_key_from_jwt=fail))
    settings = Settings(supabase_url='https://test.supabase.co', supabase_publishable_key='public', _env_file=None)
    with pytest.raises(HTTPException) as error:
        auth.verify_token('private-session-token', settings)
    assert error.value.status_code == 503
    assert 'SSLCertVerificationError' in caplog.text
    assert 'private' not in caplog.text


def test_valid_es256_google_provider_session(monkeypatch):
    key = ec.generate_private_key(ec.SECP256R1())
    monkeypatch.setattr(auth, 'jwks_client', lambda _: SimpleNamespace(
        get_signing_key_from_jwt=lambda _: SimpleNamespace(key=key.public_key())))
    settings = Settings(supabase_url='https://test.supabase.co', supabase_publishable_key='public', _env_file=None)
    token = jwt.encode({'sub': str(USER), 'iss': 'https://test.supabase.co/auth/v1', 'aud': 'authenticated',
                        'role': 'authenticated', 'exp': datetime.now(UTC) + timedelta(minutes=5),
                        'app_metadata': {'provider': 'google'}}, key, algorithm='ES256', headers={'kid': 'test-key'})
    assert auth.verify_token(token, settings).user_id == USER


def test_rejected_session_logs_safe_reason_and_algorithm(monkeypatch, caplog):
    def reject(_token):
        raise jwt.PyJWKClientError('private key identifier or URL')
    monkeypatch.setattr(auth, 'jwks_client', lambda _: SimpleNamespace(get_signing_key_from_jwt=reject))
    settings = Settings(supabase_url='https://test.supabase.co', supabase_publishable_key='public', _env_file=None)
    token = jwt.encode({'sub': 'private-user'}, 'test-only-' * 6, algorithm='HS256')
    with pytest.raises(HTTPException) as error:
        auth.verify_token(token, settings)
    assert error.value.status_code == 401
    assert 'PyJWKClientError' in caplog.text and 'signing_algorithm=HS256' in caplog.text
    assert token not in caplog.text and 'private' not in caplog.text


@pytest.mark.parametrize('body,expected', [
    ({'message': 'Invalid API key'}, 503),
    ({'message': 'Secret API key required'}, 503),
    ({'code': 'PGRST301', 'message': 'private JWT detail'}, 401),
])
def test_database_distinguishes_backend_key_and_session_failures(body, expected, caplog):
    async def run():
        settings = Settings(supabase_url='https://test.supabase.co', supabase_publishable_key='public', _env_file=None)
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(401, json=body))) as client:
            with pytest.raises(HTTPException) as error:
                await Database(client, settings, Identity(USER, 'private-token')).request('GET', 'user_recent_locations')
            assert error.value.status_code == expected
    asyncio.run(run())
    assert 'Supabase Data API rejected access' in caplog.text
    assert 'private' not in caplog.text
