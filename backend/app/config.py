from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DB_URL: str
    APP_ENV: str = "development"
    SECRET_KEY: str = "change-me"
    ALLOWED_ORIGINS: str = "http://localhost:3000"
    HF_SPACE_URL: str = "https://roniegbu-reqgen-nlp.hf.space"
    HF_MODEL_NAME: str = "deepset/deberta-v3-base-squad2"

    class Config:
        env_file = ".env"


settings = Settings()
