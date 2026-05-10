from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import check_db_connection
from app.api import auth, projects, user_stories, requirements, exports, traceability, rasa
import app.models 

app = FastAPI(
    title="ReqGen API",
    description="AI-Powered Requirements Generation System",
    version="1.0.0",
    docs_url="/docs",       
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
print(f"Allowed CORS origins: {settings.ALLOWED_ORIGINS.split(',')}")

# Routers
app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(user_stories.router)
app.include_router(requirements.router)
app.include_router(exports.router)
app.include_router(traceability.router)
app.include_router(rasa.router)

@app.get("/", tags=["Root"])
def root():
    return {
        "system": "ReqGen API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
    }


@app.get("/health", tags=["Health"])
def health_check():
    db_ok = check_db_connection()
    return {
        "api": "ok",
        "database": "ok" if db_ok else "unreachable",
        "environment": settings.APP_ENV,
    }