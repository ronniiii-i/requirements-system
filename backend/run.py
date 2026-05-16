import uvicorn
from alembic.config import Config
from alembic import command
from app.config import settings

def run_migrations():
    print("Running database migrations...")
    try:
        alembic_cfg = Config("alembic.ini")
        command.upgrade(alembic_cfg, "head")
        print("Migrations applied successfully!")
    except Exception as e:
        print(f"Migration failed: {e}")
        raise e

if __name__ == "__main__":
    run_migrations()
    
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8001,
        reload=settings.APP_ENV == "development",
    )