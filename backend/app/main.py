from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

# 🔒 .env laden
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))

app = FastAPI()

# ✅ CORS-Middleware aktivieren
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # React-Frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 🔌 Router importieren
from app.routers import admin, experts, customers, auth, projects

# 🔌 Router registrieren
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(experts.router)
app.include_router(customers.router)
app.include_router(projects.router)  # ❗ wichtig für Kunden-Projekte

# Test-Route
@app.get("/")
def root():
    return {"message": "Priv-Control API läuft ✅"}
