from copy import deepcopy
from datetime import UTC, datetime

import httpx
import pytest

from conftest import provider_fixture
from weather_pipeline.transform import astronomical_time, number, transform_forecast, transform_search
from weather_pipeline.worker import PipelineError, Services, process_queue


def test_all_requested_fields_and_three_local_days(payload, fixed_now):
    result = transform_forecast(payload, fixed_now)
    assert len(result['days']) == 3 and len(result['hours']) == 72
    assert result['current']['pressure_hpa'] == 1012
    assert result['hours'][0]['uv'] == 3.4
    assert result['days'][0]['moon_illumination'] == 75
    assert result['days'][0]['sunrise'] == '2026-10-23T12:30:00+00:00'
    assert result['timezone'] == 'America/Mexico_City'


def test_local_date_does_not_use_server_date():
    now = datetime(2026, 10, 24, 1, tzinfo=UTC)
    result = transform_forecast(provider_fixture(now), now)
    assert result['days'][0]['forecast_date'] == '2026-10-23'


@pytest.mark.parametrize('now,expected', [(datetime(2026, 3, 8, 15, tzinfo=UTC), 71), (datetime(2026, 11, 1, 15, tzinfo=UTC), 73)])
def test_dst_days_keep_unique_epochs(now, expected):
    result = transform_forecast(provider_fixture(now, 'America/New_York'), now)
    assert len(result['hours']) == expected
    assert len({h['forecast_at'] for h in result['hours']}) == expected


def test_null_values_are_not_zero(payload, fixed_now):
    payload['current']['uv'] = None
    payload['forecast']['forecastday'][0]['astro']['sunrise'] = 'No sunrise'
    result = transform_forecast(payload, fixed_now)
    assert result['current']['uv'] is None
    assert result['days'][0]['sunrise'] is None
    assert number(0) == 0


@pytest.mark.parametrize('mutate', [
    lambda p: p['forecast']['forecastday'].pop(),
    lambda p: p['forecast']['forecastday'][0]['hour'].pop(),
    lambda p: p['current'].update(humidity=101),
    lambda p: p['current'].update(temp_c=float('nan')),
    lambda p: p['forecast']['forecastday'][0]['hour'][1].update(time_epoch=p['forecast']['forecastday'][0]['hour'][0]['time_epoch']),
])
def test_incomplete_or_invalid_payload_is_rejected(payload, fixed_now, mutate):
    mutate(payload)
    with pytest.raises(ValueError):
        transform_forecast(payload, fixed_now)


def test_search_deduplicates_without_losing_region():
    item = {'id': 1, 'name': 'Springfield', 'region': 'Illinois', 'country': 'USA', 'lat': 39.8, 'lon': -89.6}
    assert transform_search([item, item]) == [{'provider_id': 1, 'name': 'Springfield', 'region': 'Illinois', 'country': 'USA', 'latitude': 39.8, 'longitude': -89.6}]
    assert transform_search([]) == []


class FakeServices:
    def __init__(self, cached=False, failure=None):
        self.jobs = [{'id': 'job', 'lease_token': 'lease', 'kind': 'search', 'query': 'Paris', 'attempts': 1}]
        self.calls, self.cached, self.failure = [], cached, failure

    def rpc(self, name, payload):
        self.calls.append((name, payload))
        if name == 'claim_ingestion_job': return self.jobs.pop() if self.jobs else None
        if name == 'resolve_cached_job': return self.cached

    def provider(self, *args, **kwargs):
        self.calls.append(('provider', kwargs))
        if self.failure: raise self.failure
        return []


def test_worker_reuses_cache_without_provider_call():
    services = FakeServices(cached=True)
    assert process_queue(services) == 1
    assert 'provider' not in [name for name, _ in services.calls]


def test_worker_publishes_search_and_failure_is_sanitized():
    services = FakeServices()
    process_queue(services)
    assert ('publish_search', {'p_job_id': 'job', 'p_lease': 'lease', 'p_locations': []}) in services.calls
    services = FakeServices(failure=PipelineError('Cuota agotada', False))
    process_queue(services)
    failure = next(body for name, body in services.calls if name == 'fail_ingestion_job')
    assert failure['p_retryable'] is False and failure['p_error'] == 'Cuota agotada'


@pytest.mark.parametrize('status,body,retryable', [
    (401, {'error': {'code': 1002}}, False),
    (401, {'error': {'code': 2006}}, False),
    (403, {'error': {'code': 2007}}, False),
    (403, {'error': {'code': 2008}}, False),
    (403, {'error': {'code': 2009}}, False),
    (500, {}, True), (429, {}, True),
])
def test_provider_errors_never_expose_api_key(monkeypatch, status, body, retryable):
    monkeypatch.setenv('SUPABASE_URL', 'https://test.supabase.co')
    monkeypatch.setenv('SUPABASE_SERVICE_ROLE_KEY', 'test-role')
    monkeypatch.setenv('WEATHERAPI_KEY', 'private-test-key')
    services = Services()
    services.client.close()
    services.client = httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(status, json=body)))
    try:
        with pytest.raises(PipelineError) as error:
            services.provider('forecast', q='id:1')
        assert error.value.retryable is retryable
        assert 'private-test-key' not in str(error.value) and 'https://' not in str(error.value)
        if body.get('error'):
            assert str(body['error']['code']) in str(error.value)
    finally: services.close()


@pytest.mark.parametrize('code,fragment', [(2006, 'no es válida'), (2007, 'cuota mensual'),
                                         (2008, 'deshabilitada'), (2009, 'plan no permite')])
def test_account_error_is_saved_without_retry_or_provider_secrets(monkeypatch, caplog, code, fragment):
    monkeypatch.setenv('SUPABASE_URL', 'https://test.supabase.co')
    monkeypatch.setenv('SUPABASE_SERVICE_ROLE_KEY', 'test-role')
    monkeypatch.setenv('WEATHERAPI_KEY', 'private-test-key')
    services = Services()
    services.client.close()
    services.client = httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(
        401 if code == 2006 else 403, json={'error': {'code': code, 'message': 'private-test-key'}})))
    try:
        with pytest.raises(PipelineError) as error:
            services.provider('search', q='new york')
        queued = FakeServices(failure=error.value)
        process_queue(queued)
        failure = next(body for name, body in queued.calls if name == 'fail_ingestion_job')
        assert fragment in failure['p_error']
        assert failure['p_retryable'] is False
        assert 'private-test-key' not in failure['p_error']
        assert 'private-test-key' not in caplog.text
    finally:
        services.close()
