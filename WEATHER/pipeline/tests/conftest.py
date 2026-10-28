from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest


def provider_fixture(now, timezone='America/Mexico_City'):
    zone = ZoneInfo(timezone)
    today = now.astimezone(zone).date()
    measurement = {'temp_c': 22.5, 'feelslike_c': 23.2, 'condition': {'code': 1003, 'text': 'Parcialmente nublado'},
                   'is_day': 1, 'pressure_mb': 1012, 'humidity': 62, 'cloud': 35, 'wind_kph': 12.6,
                   'wind_degree': 315, 'gust_kph': 19.8, 'uv': 3.4}
    days = []
    for i in range(3):
        day = today + timedelta(days=i)
        stamp = datetime.combine(day, time(), zone).astimezone(UTC)
        end = datetime.combine(day + timedelta(days=1), time(), zone).astimezone(UTC)
        hours = []
        while stamp < end:
            hours.append({**measurement, 'time_epoch': int(stamp.timestamp())})
            stamp += timedelta(hours=1)
        days.append({'date': day.isoformat(), 'day': {'mintemp_c': 14, 'maxtemp_c': 26, 'condition': measurement['condition']},
                     'astro': {'sunrise': '06:30 AM', 'sunset': '06:45 PM', 'moon_phase': 'Waxing Gibbous', 'moon_illumination': '75'}, 'hour': hours})
    return {'location': {'tz_id': timezone}, 'current': {**measurement, 'last_updated_epoch': int(now.timestamp())},
            'forecast': {'forecastday': days}}


@pytest.fixture
def fixed_now():
    return datetime(2026, 10, 23, 18, tzinfo=UTC)


@pytest.fixture
def payload(fixed_now):
    return provider_fixture(fixed_now)
