"""
Central configuration, loaded from environment variables (.env).
Never hardcode secrets here — this file only defines *where* config comes from.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db_name: str = "guru_ai"

    jwt_secret: str = "insecure-dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 720

    ai_provider: str = "openai"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    granite_api_key: str = ""
    granite_api_url: str = ""

    # Groq — powers the real agents (Lesson, Language, Quiz, Community Knowledge, Voice/STT).
    # Get a free key at https://console.groq.com/keys
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    groq_whisper_model: str = "whisper-large-v3-turbo"

    frontend_origin: str = "http://localhost:3000"


settings = Settings()
