# app/main.py
import os, json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# --- CORS ---
raw = os.getenv("ALLOWED_ORIGINS", '["http://localhost:5173","http://127.0.0.1:5173","https://www.energienachweise.com","https://energienachweise.com"]')
try:
    origins = json.loads(raw)
    if not isinstance(origins, list):
        origins = [str(origins)]
except Exception:
    origins = [raw]

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(set(origins)),   # doppelte entfernen
    allow_methods=["*"],                # GET, POST, OPTIONS, etc.
    allow_headers=["*"],                # z.B. Content-Type, Authorization
    allow_credentials=False,            # wichtig: keine Cookies, nur Bearer-Token
)

# --- Router danach importieren ---
from app.routers.auth import router as auth_router
from app.routers.admin import router as admin_router
from app.routers.customer import router as customer_router
from app.routers.experts import router as experts_router
from app.routers.projects import router as projects_router
from app.routers.quotes import router as quotes_router
from app.routers.requests import router as requests_router
from app.routers.matching import router as matching_router

app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(customer_router)
app.include_router(experts_router)
app.include_router(projects_router)
app.include_router(quotes_router)
app.include_router(requests_router)
app.include_router(matching_router)
