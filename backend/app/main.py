# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os, json

from app.routers.auth import router as auth_router
from app.routers.customer import router as customers_router  # <= singular!
from app.routers.experts import router as experts_router
from app.routers.admin import router as admin_router
from app.routers.projects import router as projects_router
from app.routers.requests import router as requests_router
from app.routers.quotes import router as quotes_router
from app.routers.matching import router as matching_router

app = FastAPI(title="Energienachweise.com API", version="1.0.0")

raw = os.getenv("ALLOWED_ORIGINS", '["http://localhost:3000","http://127.0.0.1:3000"]')
try:
    origins = json.loads(raw)
    if not isinstance(origins, list):
        origins = [str(origins)]
except Exception:
    origins = ["http://localhost:3000", "http://127.0.0.1:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok"}

app.include_router(auth_router)
app.include_router(customers_router)
app.include_router(experts_router)
app.include_router(admin_router)
app.include_router(projects_router)
app.include_router(requests_router)
app.include_router(quotes_router)
app.include_router(matching_router)
