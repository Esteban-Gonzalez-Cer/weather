import base64
import copy
import json
from pathlib import Path

import httpx
import pytest

from countries_pipeline.config import Settings
from countries_pipeline.database import Database
from countries_pipeline.errors import PipelineError
from countries_pipeline.jobs import process_one
from countries_pipeline.provider import API_URL, Provider
from countries_pipeline.transform import normalize_country

SOURCE = json.loads((Path(__file__).parent/'fixtures/canada-v5.json').read_text())
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==')
SETTINGS = Settings('https://test.supabase.co','sb_secret_private','rc_live_fixture')


def sample(index):
    row=copy.deepcopy(SOURCE)
    alpha2=chr(65+index//26)+chr(65+index%26)
    row['codes']={'alpha_2':alpha2,'alpha_3':'X'+alpha2}
    return row


def test_v5_transform_preserves_spanish_native_names_and_details():
    country=normalize_country(SOURCE)
    assert country['code'] == 'CAN'
    assert country['spanish_name'] == 'Canadá'
    assert country['capitals'] == ['Ottawa']
    assert country['area_km2'] == 9984670
    assert country['languages'][1]['native_name'] == 'français'
    assert country['currencies'][0]['code'] == 'CAD'
    assert 'canada' in country['search_text']
    assert country['independent'] is True


def test_missing_values_stay_nullable_and_zero_stays_zero():
    row=copy.deepcopy(SOURCE)
    row.update(population=0,area={},coordinates={},capitals=[],languages=[],currencies=[])
    country=normalize_country(row)
    assert country['population'] == 0
    assert country['area_km2'] is None
    assert country['latitude'] is None
    assert country['capitals'] == []
    row.pop('population')
    assert normalize_country(row)['population'] is None


@pytest.mark.parametrize('field,value',[('population',-1),('population',True),('population',float('nan')),('population',2.5),('coordinates',{'lat':91})])
def test_invalid_measurements_cannot_be_published(field,value):
    with pytest.raises(PipelineError):
        normalize_country({**SOURCE,field:value})


def test_all_v5_pages_and_database_backed_flag_content_are_collected_without_leaking_the_key():
    requests=[]
    def respond(request):
        requests.append(request)
        if request.url.host == 'api.restcountries.com':
            offset=int(request.url.params['offset'])
            assert request.headers['Authorization'] == 'Bearer secret-provider-key'
            return httpx.Response(200,json={'data':{'objects':[sample(i) for i in range(offset,offset+100)],'meta':{'total':200,'offset':offset,'count':100}}})
        assert request.url.host == 'flags.restcountries.com'
        assert 'Authorization' not in request.headers
        assert request.url.path.startswith('/v5/w320/')
        return httpx.Response(200,content=PNG)
    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        result=Provider(client,'secret-provider-key').snapshot()
    assert len(result) == 200
    assert all(base64.b64decode(c['flag_png_base64']) == PNG for c in result)
    assert len([r for r in requests if r.url.host == 'api.restcountries.com']) == 2
    assert all('secret-provider-key' not in str(r.url) for r in requests)


@pytest.mark.parametrize('payload',[
    {'data':{'_demo':{'message':'sample'},'objects':[SOURCE],'meta':{'total':1}}},
    {'data':{'objects':[SOURCE],'meta':{'total':1}}},
    [{'name':{'common':'old v3.1 format'}}],
])
def test_demo_incomplete_and_legacy_payloads_are_rejected(payload):
    with httpx.Client(transport=httpx.MockTransport(lambda _:httpx.Response(200,json=payload))) as client:
        with pytest.raises(PipelineError):
            Provider(client,'key').countries()


def test_duplicate_provider_pages_are_rejected():
    with httpx.Client(transport=httpx.MockTransport(lambda _:httpx.Response(200,json={'data':{'objects':[sample(i) for i in range(100)],'meta':{'total':200}}}))) as client:
        with pytest.raises(PipelineError,match='duplicados'):
            Provider(client,'key').countries()


def test_code_less_records_do_not_abort_complete_catalog_or_flag_download(caplog):
    rows=[sample(i) for i in range(200)]
    for name in ('Abkhazia','Northern Cyprus','Somaliland','South Ossetia'):
        rows.insert(0,{**copy.deepcopy(SOURCE),'codes':{'alpha_2':'','alpha_3':''},
                      'names':{'common':name}})
    flag_calls=[]
    def respond(request):
        if request.url.host == 'api.restcountries.com':
            offset=int(request.url.params['offset'])
            return httpx.Response(200,json={'data':{'objects':rows[offset:offset+100],
                'meta':{'total':len(rows),'offset':offset}}})
        flag_calls.append(request)
        return httpx.Response(200,content=PNG)
    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        result=Provider(client,'key').snapshot()
    assert len(result)==200 and len(flag_calls)==200
    assert '4 records without ISO codes excluded' in caplog.text


@pytest.mark.parametrize('codes',[{'alpha_2':'CA','alpha_3':''},{'alpha_2':'123','alpha_3':'CAN'}, {'alpha_2':3,'alpha_3':4}])
def test_malformed_or_partial_codes_still_abort_catalog(codes):
    rows=[sample(i) for i in range(100)]
    rows[0]['codes']=codes
    with httpx.Client(transport=httpx.MockTransport(lambda _:httpx.Response(200,json={
        'data':{'objects':rows,'meta':{'total':200}}}))) as client:
        with pytest.raises(PipelineError):
            Provider(client,'key').countries()


def test_airflow_entrypoint_reports_a_recorded_ingestion_failure(monkeypatch):
    from countries_pipeline import jobs
    monkeypatch.setattr(jobs.Settings,'load',lambda:SETTINGS)
    monkeypatch.setattr(jobs,'process_one',lambda *args:'failed')
    with pytest.raises(PipelineError,match='ingestion_jobs'):
        jobs.run()


@pytest.mark.parametrize('status,retryable',[(401,False),(403,False),(410,False),(429,True),(500,True)])
def test_provider_errors_are_specific_and_sanitized(status,retryable):
    with httpx.Client(transport=httpx.MockTransport(lambda _:httpx.Response(status,json={'errors':[{'message':'secret-key private-text'}]}))) as client:
        with pytest.raises(PipelineError) as error:
            Provider(client,'secret-key').countries()
        assert error.value.retryable is retryable
        assert 'secret-key' not in str(error.value) and 'private-text' not in str(error.value)
        if status == 401:
            assert 'RESTCOUNTRIES_API_KEY' in str(error.value)


@pytest.mark.parametrize('body',[b'<svg onload="attack()"/>',b'not-an-image',b'x'*260_000])
def test_flags_reject_non_png_and_oversized_content(body):
    with httpx.Client(transport=httpx.MockTransport(lambda _:httpx.Response(200,content=body))) as client:
        with pytest.raises(PipelineError):
            Provider(client,'key').flag('CA')


def test_flag_retry_is_bounded_and_url_cannot_be_injected(monkeypatch):
    monkeypatch.setattr('countries_pipeline.provider.time.sleep',lambda _:None)
    requests=[]
    def respond(request):
        requests.append(request)
        return httpx.Response(503)
    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        with pytest.raises(PipelineError):
            Provider(client,'key').flag('CA')
        assert len(requests) == 3
        with pytest.raises(PipelineError):
            Provider(client,'key').flag('https://attacker.test')
        assert len(requests) == 3


class FakeDatabase:
    def __init__(self): self.calls=[]
    def rpc(self,name,payload=None):
        self.calls.append((name,payload))
        if name == 'claim_catalog_job': return {'id':'job','attempts':1}
        return True


def test_worker_publishes_once_and_marks_failures_without_storing_raw_exceptions(caplog):
    class BrokenProvider:
        def snapshot(self): raise RuntimeError('secret-provider-key private-url')
    db=FakeDatabase()
    assert process_one(db,BrokenProvider(),SETTINGS) == 'failed'
    assert [c[0] for c in db.calls] == ['claim_catalog_job','fail_catalog_job']
    assert 'secret-provider-key' not in str(db.calls) + caplog.text
    assert 'private-url' not in str(db.calls) + caplog.text
    class GoodProvider:
        def snapshot(self): return [{'code':'CAN'}]
    db=FakeDatabase()
    assert process_one(db,GoodProvider(),SETTINGS) == 'succeeded'
    assert db.calls[-1][0] == 'publish_countries'
    assert db.calls[-1][1]['p_attempt'] == 1


def test_missing_provider_key_becomes_a_clear_failed_job():
    db=FakeDatabase()
    assert process_one(db,None,Settings(SETTINGS.supabase_url,SETTINGS.service_key,'')) == 'failed'
    assert 'clave propia' in db.calls[-1][1]['p_error']


@pytest.mark.parametrize('key',['sb_secret_private','legacy.jwt.service'])
def test_pipeline_database_auth_supports_new_secret_and_legacy_service_keys(key):
    requests=[]
    def respond(request): requests.append(request); return httpx.Response(200,content=b'null')
    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        Database(client,Settings(SETTINGS.supabase_url,key,'provider')).rpc('claim_catalog_job')
    assert requests[0].headers['apikey'] == key
    assert ('Authorization' in requests[0].headers) is (not key.startswith('sb_secret_'))


@pytest.mark.parametrize('status',[200,204])
def test_scheduler_void_response_is_successful(status):
    with httpx.Client(transport=httpx.MockTransport(lambda _:httpx.Response(status))) as client:
        assert Database(client,SETTINGS).rpc('schedule_catalog_refresh') is None


def test_database_failure_exposes_only_safe_code_for_diagnostics(caplog):
    response=httpx.Response(400,json={'code':'21000','message':'private SQL content'})
    with httpx.Client(transport=httpx.MockTransport(lambda _:response)) as client:
        with pytest.raises(PipelineError,match='21000') as error:
            Database(client,SETTINGS).rpc('publish_countries',{})
    assert '21000' in caplog.text
    assert 'private SQL' not in str(error.value)+caplog.text


def test_airflow_dags_parse_and_are_separate_from_weather(tmp_path,monkeypatch):
    monkeypatch.setenv('AIRFLOW_HOME',str(tmp_path/'airflow'))
    monkeypatch.setenv('AIRFLOW__CORE__LOAD_EXAMPLES','False')
    from airflow.dag_processing.dagbag import DagBag
    bag=DagBag(dag_folder=str(Path(__file__).resolve().parents[1]/'dags'),safe_mode=False)
    assert not bag.import_errors
    assert set(bag.dags) == {'countries_process_requests','countries_schedule_catalog'}
    assert all(dag.max_active_runs == 1 for dag in bag.dags.values())
