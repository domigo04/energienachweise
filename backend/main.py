import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import Base, engine
from .models import user as user_model
from .routers import auth as auth_router
from .routers import admin as admin_router
from .routers import experts as experts_router
from .routers import customers as customers_router

Base.metadata.create_all(bind=engine)  # Alembic übernimmt später – ok für Start

app = FastAPI(title="Energienachweise API")

origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(admin_router.router)
app.include_router(experts_router.router)
app.include_router(customers_router.router)

@app.get("/health")
def health():
    return {"status": "ok"}
