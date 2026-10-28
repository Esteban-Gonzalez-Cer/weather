"""Provider-to-database mapping. No network access or Airflow imports."""
import math
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo


def number(value, minimum=None, maximum=None):
    if value is None or value == '':
        return None
    if isinstance(value, bool):
        raise ValueError('Boolean measurement')
    result = float(value)
    if not math.isfinite(result) or (minimum is not None and result < minimum) or (maximum is not None and result > maximum):
        raise ValueError('Measurement outside valid range')
    return result


def epoch(value):
    if value is None:
        raise ValueError('Missing timestamp')
    return datetime.fromtimestamp(float(value), UTC).isoformat()


def measurements(source):
    condition = source.get('condition') or {}
    code = number(condition.get('code'), 0)
    if code is not None and not code.is_integer():
        raise ValueError('Invalid condition code')
    is_day = source.get('is_day')
    if is_day not in (None, 0, 1):
        raise ValueError('Invalid day/night flag')
    return {
        'temp_c': number(source.get('temp_c')),
        'feelslike_c': number(source.get('feelslike_c')),
        'condition_code': int(code) if code is not None else None,
        'condition_text': condition.get('text'),
        'is_day': bool(is_day) if is_day is not None else None,
        'pressure_hpa': number(source.get('pressure_mb'), 0),  # 1 millibar = 1 hPa
        'humidity': number(source.get('humidity'), 0, 100),
        'cloud': number(source.get('cloud'), 0, 100),
        'wind_kph': number(source.get('wind_kph'), 0),
        'wind_degree': number(source.get('wind_degree'), 0, 360),
        'gust_kph': number(source.get('gust_kph'), 0),
        'uv': number(source.get('uv'), 0),
    }


def astronomical_time(value, day, zone):
    # Polar locations may explicitly have no sunrise or sunset on a date.
    if not value or str(value).lower().startswith('no '):
        return None
    local = datetime.combine(day, datetime.strptime(value.strip(), '%I:%M %p').time(), tzinfo=zone)
    return local.astimezone(UTC).isoformat()


def transform_search(payload):
    if not isinstance(payload, list):
        raise ValueError('Invalid search payload')
    result = []
    seen = set()
    for item in payload:
        provider_id = int(item['id'])
        if provider_id in seen:
            continue
        seen.add(provider_id)
        if not item.get('name') or not item.get('country'):
            raise ValueError('Missing location name')
        lat = number(item.get('lat'), -90, 90)
        lon = number(item.get('lon'), -180, 180)
        if lat is None or lon is None:
            raise ValueError('Missing coordinates')
        result.append({'provider_id': provider_id, 'name': item['name'], 'region': item.get('region') or '',
                       'country': item['country'], 'latitude': lat, 'longitude': lon})
    return result


def transform_forecast(payload, now=None):
    now = now or datetime.now(UTC)
    zone = ZoneInfo(payload['location']['tz_id'])
    today = now.astimezone(zone).date()
    expected_dates = {today + timedelta(days=i) for i in range(3)}
    current = measurements(payload['current'])
    current['observed_at'] = epoch(payload['current']['last_updated_epoch'])
    days, hours, timestamps, dates = [], [], set(), set()
    for source in payload['forecast']['forecastday']:
        day = date.fromisoformat(source['date'])
        if day not in expected_dates or day in dates:
            raise ValueError('Unexpected or repeated local date')
        dates.add(day)
        data, astro = source['day'], source['astro']
        condition = data.get('condition') or {}
        low, high = number(data.get('mintemp_c')), number(data.get('maxtemp_c'))
        if low is not None and high is not None and low > high:
            raise ValueError('Invalid daily temperature range')
        days.append({
            'forecast_date': day.isoformat(), 'min_temp_c': low, 'max_temp_c': high,
            'condition_code': condition.get('code'), 'condition_text': condition.get('text'),
            'sunrise': astronomical_time(astro.get('sunrise'), day, zone),
            'sunset': astronomical_time(astro.get('sunset'), day, zone),
            'moon_phase': astro.get('moon_phase'),
            'moon_illumination': number(astro.get('moon_illumination'), 0, 100),
        })
        # DST days can contain 23 or 25 hours. Epochs disambiguate repeated hours.
        start = datetime.combine(day, time(), zone).astimezone(UTC)
        end = datetime.combine(day + timedelta(days=1), time(), zone).astimezone(UTC)
        duration = (end - start).total_seconds() / 3600
        # Some locations shift by half an hour; accept their bounding hour counts.
        if len(source['hour']) not in {math.floor(duration), math.ceil(duration)}:
            raise ValueError('Incomplete hourly forecast')
        for hour in source['hour']:
            stamp = epoch(hour['time_epoch'])
            if stamp in timestamps or datetime.fromisoformat(stamp).astimezone(zone).date() != day:
                raise ValueError('Repeated or misplaced forecast hour')
            timestamps.add(stamp)
            hours.append({'forecast_at': stamp, 'forecast_date': day.isoformat(), **measurements(hour)})
    if dates != expected_dates:
        raise ValueError('Provider did not supply the local three-day window')
    return {'timezone': str(zone), 'current': current,
            'days': sorted(days, key=lambda d: d['forecast_date']), 'hours': sorted(hours, key=lambda h: h['forecast_at'])}
