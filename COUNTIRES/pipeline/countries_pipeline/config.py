import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

from .errors import PipelineError


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    service_key: str
    provider_key: str

    @classmethod
    def load(cls):
        load_dotenv(Path(__file__).resolve().parents[1] / '.env')
        return cls(os.getenv('SUPABASE_URL', '').strip().rstrip('/'),
                   os.getenv('SUPABASE_SERVICE_ROLE_KEY', '').strip(),
                   os.getenv('RESTCOUNTRIES_API_KEY', '').strip())

    def validate_database(self):
        if not self.supabase_url.startswith('https://') or not self.service_key or 'YOUR_' in self.supabase_url + self.service_key:
            raise PipelineError('Configura el proyecto Supabase de COUNTRIES y su clave privilegiada en pipeline/.env.')

    def validate_provider(self):
        if not self.provider_key or 'YOUR_' in self.provider_key or self.provider_key == 'rc_live_demo':
            raise PipelineError('Configura una clave propia de REST Countries en pipeline/.env. La clave demo no carga el catálogo.')
