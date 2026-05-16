from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DB_URL: str
    APP_ENV: str = "development"
    SECRET_KEY: str = "change-me"
    ALLOWED_ORIGINS: str = "http://localhost:3000, http://localhost:5173,https://requirements-system.vercel.app"
    HF_SPACE_URL: str = "https://roniegbu-reqgen-nlp.hf.space"
    HF_MODEL_NAME: str = "deepset/deberta-v3-base-squad2"
    RASA_SERVER_URL: str = "http://localhost:5005"

    class Config:
        env_file = ".env"


settings = Settings()
