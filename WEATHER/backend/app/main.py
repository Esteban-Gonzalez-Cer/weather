from contextlib import asynccontextmanager
from uuid import UUID

import httpx
from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware

from .auth import Identity, require_user
from .config import get_settings
from .database import Database, get_database
from .models import JobResult, OperationResult, RecentItem, SearchInput, WeatherBundle


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
        app.state.http = client
        yield


app = FastAPI(title='WEATHER · API', version='1.0.0', lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=get_settings().allowed_origins,
    allow_methods=['GET', 'POST'], allow_headers=['Authorization', 'Content-Type'],
)


@app.get('/health')
def health():
    return {'status': 'ok', 'configured': get_settings().configured}


@app.post('/api/v1/searches', response_model=OperationResult)
async def search(body: SearchInput, response: Response, db: Database = Depends(get_database)):
    result = await db.rpc('submit_search', {'p_query': body.query})
    response.status_code = 200 if result['status'] == 'completed' else 202
    return result


@app.get('/api/v1/jobs/{job_id}', response_model=JobResult)
async def job(job_id: UUID, db: Database = Depends(get_database), user: Identity = Depends(require_user)):
    rows = await db.request('GET', 'ingestion_jobs', params={
        'id': f'eq.{job_id}', 'requested_by': f'eq.{user.user_id}',
        'select': 'id,kind,status,results,error,attempts,created_at,updated_at', 'limit': '1',
    })
    if not rows:
        raise HTTPException(404, 'Solicitud no encontrada.')
    return rows[0]


@app.post('/api/v1/locations/{location_id}/select', response_model=OperationResult)
async def select_location(location_id: UUID, response: Response, db: Database = Depends(get_database)):
    result = await db.rpc('select_location', {'p_location_id': str(location_id)})
    response.status_code = 200 if result['status'] == 'completed' else 202
    return result


@app.get('/api/v1/locations/{location_id}/weather', response_model=WeatherBundle)
async def weather(location_id: UUID, db: Database = Depends(get_database)):
    result = await db.rpc('weather_bundle', {'p_location_id': str(location_id)})
    if result is None:
        raise HTTPException(404, 'Ubicación no encontrada.')
    return result


@app.get('/api/v1/me/recent-locations', response_model=list[RecentItem])
async def recents(db: Database = Depends(get_database), user: Identity = Depends(require_user)):
    return await db.request('GET', 'user_recent_locations', params={
        'user_id': f'eq.{user.user_id}', 'order': 'selected_at.desc', 'limit': '5',
        'select': 'selected_at,location:locations(id,provider_id,name,region,country,latitude,longitude,timezone,current:current_weather(temp_c,condition_code,condition_text,is_day))',
    })
