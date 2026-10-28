from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=Path(__file__).resolve().parents[1] / '.env', extra='ignore')
    supabase_url: str = ''
    supabase_publishable_key: str = ''
    allowed_origins: list[str] = ['http://localhost:5175', 'http://127.0.0.1:5175']

    @property
    def configured(self) -> bool:
        return bool(self.supabase_url.startswith('https://') and 'YOUR_' not in self.supabase_url
                    and self.supabase_publishable_key and 'YOUR_' not in self.supabase_publishable_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
