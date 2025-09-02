# backend/app/database.py
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# .env laden (liegt im Ordner backend/)
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./privcontrol.db")

# relative SQLite-Pfade robust absolut machen
if DATABASE_URL.startswith("sqlite:///./"):
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))  # = backend/
    rel_path = DATABASE_URL.replace("sqlite:///./", "")
    abs_path = os.path.join(base_dir, rel_path)
    DATABASE_URL = f"sqlite:///{abs_path}"

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
