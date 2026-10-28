from uuid import UUID

import httpx
import pytest
from fastapi.testclient import TestClient

from app.auth import Identity, require_user
from app.database import get_database
from app.main import app

USER = UUID('11111111-1111-4111-8111-111111111111')
JOB = '33333333-3333-4333-8333-333333333333'
CARD = {'code':'MEX','alpha2':'MX','name':'Mexico','spanish_name':'México','region':'Americas',
        'capitals':['Ciudad de México'],'population':0,'area_km2':None,'flag_png_base64':'database-flag'}


class FakeDatabase:
    def __init__(self):
        self.result, self.calls = None, []

    async def rpc(self, name, payload):
        self.calls.append((name,payload))
        return self.result

    async def request(self, method, path, **kwargs):
        self.calls.append((method,path,kwargs))
        return self.result


@pytest.fixture
def client():
    app.dependency_overrides.clear()
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def db(client):
    db = FakeDatabase()
    app.dependency_overrides[get_database] = lambda: db
    app.dependency_overrides[require_user] = lambda: Identity(USER,'session-token')
    return db


@pytest.mark.parametrize('method,path', [
    ('GET','/api/v1/catalog'),('GET','/api/v1/countries'),('GET','/api/v1/countries/MEX'),
    ('POST','/api/v1/catalog/refresh'),('GET',f'/api/v1/jobs/{JOB}'),
])
def test_all_catalog_routes_require_login(client, method, path):
    response = client.request(method,path)
    assert response.status_code == 401
    assert response.headers['WWW-Authenticate'] == 'Bearer'


def test_health_is_available_without_external_accounts(client):
    assert client.get('/health').json()['service'] == 'countries'


def test_combined_filters_are_parameterized(client,db):
    db.result = {'items':[CARD],'total':1,'page':2,'page_size':12}
    response = client.get('/api/v1/countries',params={'q':'  México  ','region':'Americas','sort':'population','page':2})
    assert response.status_code == 200
    assert response.json()['items'][0]['population'] == 0
    assert response.json()['items'][0]['area_km2'] is None
    assert db.calls[-1] == ('get_countries',{'p_query':'México','p_region':'Americas','p_sort':'population','p_page':2,'p_page_size':12})


@pytest.mark.parametrize('params',[{'page':0},{'page_size':100},{'q':'x'*101},{'sort':'sql'},{'region':'a'*81}])
def test_invalid_filters_are_rejected(client,db,params):
    assert client.get('/api/v1/countries',params=params).status_code == 422
    assert not db.calls


def test_details_use_database_code_and_return_404_for_missing_country(client,db):
    db.result=[]
    assert client.get('/api/v1/countries/mex').status_code == 404
    assert db.calls[-1][2]['params']['code'] == 'eq.MEX'
    assert client.get('/api/v1/countries/MEX.invalid').status_code == 422


def test_refresh_returns_202_for_queued_or_shared_work_and_200_for_fresh_data(client,db):
    for status,code in [('queued',202),('processing',202),('fresh',200)]:
        db.result={'status':status,'job_id':None}
        assert client.post('/api/v1/catalog/refresh').status_code == code


def test_job_query_is_scoped_to_the_signed_in_user(client,db):
    db.result=[]
    assert client.get(f'/api/v1/jobs/{JOB}').status_code == 404
    assert db.calls[-1][2]['params']['requested_by'] == f'eq.{USER}'
    assert 'requested_by' not in db.calls[-1][2]['params']['select']


def test_cors_accepts_only_countries_frontend(client):
    for origin,allowed in [('http://localhost:5175',True),('http://localhost:5173',False)]:
        response=client.options('/api/v1/countries',headers={'Origin':origin,'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization'})
        assert (response.headers.get('access-control-allow-origin') == origin) is allowed


def test_real_database_adapter_never_contacts_the_provider_or_mixes_user_tokens():
    import asyncio
    from app.config import Settings
    from app.database import Database
    calls=[]
    def handle(request):
        calls.append(request)
        return httpx.Response(200,json=[])
    async def run():
        settings=Settings(supabase_url='https://test.supabase.co',supabase_publishable_key='publishable',_env_file=None)
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
            for token in ['alice','bob']:
                await Database(client,settings,Identity(USER,token)).rpc('get_countries',{})
            assert 'Authorization' not in client.headers
    asyncio.run(run())
    assert [r.headers['Authorization'] for r in calls] == ['Bearer alice','Bearer bob']
    assert all(r.url.host == 'test.supabase.co' for r in calls)
