from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class CountryCard(BaseModel):
    code: str
    alpha2: str
    name: str
    spanish_name: str | None = None
    region: str
    capitals: list[str]
    population: int | None = None
    area_km2: float | None = None
    flag_png_base64: str


class Language(BaseModel):
    code: str | None = None
    name: str
    native_name: str | None = None


class Currency(BaseModel):
    code: str
    name: str | None = None
    symbol: str | None = None


class CountryDetail(CountryCard):
    official_name: str
    native_names: dict
    subregion: str | None = None
    languages: list[Language]
    currencies: list[Currency]
    timezones: list[str]
    borders: list[str]
    continents: list[str]
    calling_codes: list[str]
    tlds: list[str]
    latitude: float | None = None
    longitude: float | None = None
    independent: bool | None = None
    un_member: bool | None = None
    ingested_at: datetime


class CountryPage(BaseModel):
    items: list[CountryCard]
    total: int
    page: int
    page_size: int


class Region(BaseModel):
    name: str
    count: int


class CatalogStatus(BaseModel):
    total: int
    last_success_at: datetime | None = None
    status: Literal['idle', 'queued', 'processing', 'failed']
    last_error: str | None = None
    provider: str
    stale: bool
    regions: list[Region]


class RefreshResult(BaseModel):
    status: Literal['fresh', 'queued', 'processing']
    job_id: UUID | None = None


class JobResult(BaseModel):
    id: UUID
    status: Literal['queued', 'processing', 'succeeded', 'failed']
    attempts: int
    error: str | None = None
    created_at: datetime
    finished_at: datetime | None = None
