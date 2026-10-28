from contextlib import asynccontextmanager
from typing import Literal
from uuid import UUID

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware

from .auth import Identity, require_user
from .config import get_settings
from .database import Database, get_database
from .models import CatalogStatus, CountryDetail, CountryPage, JobResult, RefreshResult


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with httpx.AsyncClient(timeout=20, follow_redirects=False) as client:
        app.state.http = client
        yield


app = FastAPI(title='COUNTRIES · Orbe API', version='1.0.0', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=get_settings().allowed_origins,
                   allow_methods=['GET', 'POST'], allow_headers=['Authorization', 'Content-Type'])


@app.get('/health')
def health():
    return {'status': 'ok', 'service': 'countries', 'configured': get_settings().configured}


@app.get('/api/v1/catalog', response_model=CatalogStatus)
async def catalog(db: Database = Depends(get_database)):
    return await db.rpc('get_catalog_status', {})


@app.get('/api/v1/countries', response_model=CountryPage)
async def countries(q: str = Query('', max_length=100), region: str = Query('', max_length=80),
                    sort: Literal['name', 'population', 'area'] = 'name',
                    page: int = Query(1, ge=1, le=1000), page_size: int = Query(12, ge=1, le=48),
                    db: Database = Depends(get_database)):
    return await db.rpc('get_countries', {'p_query': q.strip(), 'p_region': region,
        'p_sort': sort, 'p_page': page, 'p_page_size': page_size})


@app.get('/api/v1/countries/{code}', response_model=CountryDetail)
async def country(code: str, db: Database = Depends(get_database)):
    code = code.upper()
    if len(code) != 3 or not code.isascii() or not code.isalpha():
        raise HTTPException(422, 'Usa el código de tres letras del país.')
    rows = await db.request('GET', 'countries', params={'code': f'eq.{code}', 'select': '*', 'limit': '1'})
    if not rows:
        raise HTTPException(404, 'Este país no está disponible en el catálogo.')
    return rows[0]


@app.post('/api/v1/catalog/refresh', response_model=RefreshResult)
async def refresh(response: Response, db: Database = Depends(get_database)):
    result = await db.rpc('request_catalog_refresh', {})
    response.status_code = 200 if result['status'] == 'fresh' else 202
    return result


@app.get('/api/v1/jobs/{job_id}', response_model=JobResult)
async def job(job_id: UUID, db: Database = Depends(get_database), user: Identity = Depends(require_user)):
    rows = await db.request('GET', 'ingestion_jobs', params={
        'id': f'eq.{job_id}', 'requested_by': f'eq.{user.user_id}',
        'select': 'id,status,attempts,error,created_at,finished_at', 'limit': '1',
    })
    if not rows:
        raise HTTPException(404, 'Solicitud no encontrada.')
    return rows[0]
