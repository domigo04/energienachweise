import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

# Root-Ordner berechnen (priv-control-v2)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "privcontrol.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

# Debug-Ausgabe
print("💾 DATABASE_URL =", DATABASE_URL)

# SQLAlchemy Engine & Session
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base für alle Models
Base = declarative_base()

# Dependency für FastAPI-Router
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
