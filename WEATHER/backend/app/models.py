from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class SearchInput(BaseModel):
    query: str = Field(min_length=2, max_length=100)

    @field_validator('query')
    @classmethod
    def normalize(cls, value: str) -> str:
        value = ' '.join(value.strip().split())
        if len(value) < 2:
            raise ValueError('Escribe al menos dos caracteres.')
        return value


class Location(BaseModel):
    id: UUID
    provider_id: int
    name: str
    region: str
    country: str
    latitude: float
    longitude: float
    timezone: str | None = None


class Measurements(BaseModel):
    temp_c: float | None = None
    feelslike_c: float | None = None
    condition_code: int | None = None
    condition_text: str | None = None
    is_day: bool | None = None
    pressure_hpa: float | None = None
    humidity: float | None = None
    cloud: float | None = None
    wind_kph: float | None = None
    wind_degree: float | None = None
    gust_kph: float | None = None
    uv: float | None = None


class CurrentWeather(Measurements):
    observed_at: datetime
    fetched_at: datetime


class DailyForecast(BaseModel):
    forecast_date: date
    min_temp_c: float | None = None
    max_temp_c: float | None = None
    condition_code: int | None = None
    condition_text: str | None = None
    sunrise: datetime | None = None
    sunset: datetime | None = None
    moon_phase: str | None = None
    moon_illumination: float | None = None


class HourlyForecast(Measurements):
    forecast_at: datetime
    forecast_date: date


class WeatherBundle(BaseModel):
    location: Location
    current: CurrentWeather | None
    days: list[DailyForecast]
    hours: list[HourlyForecast]
    stale: bool


class OperationResult(BaseModel):
    status: Literal['queued', 'processing', 'completed', 'failed']
    job_id: UUID | None = None
    results: list[Location] | None = None
    data: WeatherBundle | None = None


class JobResult(BaseModel):
    id: UUID
    kind: Literal['search', 'weather']
    status: Literal['queued', 'processing', 'completed', 'failed']
    results: list[Location] | dict | None = None
    error: str | None = None
    attempts: int
    created_at: datetime
    updated_at: datetime


class RecentLocation(Location):
    current: Measurements | None = None


class RecentItem(BaseModel):
    selected_at: datetime
    location: RecentLocation
