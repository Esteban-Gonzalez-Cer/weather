import logging
import ssl

import certifi
import httpx

from .config import Settings
from .database import Database
from .errors import PipelineError
from .provider import Provider

logger = logging.getLogger(__name__)


def process_one(db: Database, provider: Provider, settings: Settings):
    job = db.rpc('claim_catalog_job')
    if not job:
        return 'idle'
    logger.info('Country catalog ingestion started (attempt=%s).', job['attempts'])
    try:
        settings.validate_provider()
        countries = provider.snapshot()
        logger.info('Publishing country catalog to Supabase (%s records).', len(countries))
        db.rpc('publish_countries', {'p_job_id': job['id'], 'p_attempt': job['attempts'],
            'p_countries': countries, 'p_expected_count': len(countries)})
        logger.info('Country catalog published (%s records).', len(countries))
        return 'succeeded'
    except Exception as error:
        # Unexpected exceptions may include request headers/URLs. Never log them or store them in jobs.
        safe = error if isinstance(error, PipelineError) else PipelineError('La carga encontró un error interno. Revisa el pipeline.')
        db.rpc('fail_catalog_job', {'p_job_id': job['id'], 'p_attempt': job['attempts'],
            'p_error': str(safe), 'p_retryable': safe.retryable})
        logger.warning('Country catalog ingestion failed (%s): %s', type(error).__name__, safe)
        return 'failed'


def run(mode='process'):
    settings = Settings.load()
    settings.validate_database()
    context = ssl.create_default_context()
    context.load_verify_locations(cafile=certifi.where())
    with httpx.Client(timeout=30, follow_redirects=False, verify=context) as client:
        db = Database(client, settings)
        if mode == 'schedule':
            db.rpc('schedule_catalog_refresh')
        else:
            result = process_one(db, Provider(client, settings.provider_key), settings)
            if result == 'failed':
                raise PipelineError('La carga del catálogo falló. Consulta el error en ingestion_jobs o en el log de esta tarea.')
