"""FastAPI serving app. Phase 4 adds predict routers."""
from fastapi import FastAPI

app = FastAPI(title="ShopStream ML API", version="0.1.0")

@app.get("/health")
def health():
    return {"status": "ok", "service": "shopstream-api"}

@app.get("/api/status")
def status():
    """Pipeline status — populated in Phase 4."""
    return {"pipeline": "initialising", "models": {}}
