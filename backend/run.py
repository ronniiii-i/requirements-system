import subprocess
import sys
import uvicorn
from app.config import settings

if __name__ == "__main__":
    # Run migrations before starting the server.
    # On Render, this means every deploy automatically migrates the DB
    # before any traffic is accepted.
    print("Running database migrations...")
    result = subprocess.run(
        ["alembic", "upgrade", "head"],
        capture_output=False,   # let output stream to Render logs
    )
    if result.returncode != 0:
        print("Migration failed — aborting startup.")
        sys.exit(1)
    print("Migrations complete.")

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8001,
        reload=settings.APP_ENV == "development",
    )