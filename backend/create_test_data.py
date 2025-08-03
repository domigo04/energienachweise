from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models import User, Project, UserRole, ProjectStatus
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password):
    return pwd_context.hash(password)

def create_test_data():
    db = SessionLocal()
    
    try:
        print("🔄 Erstelle Test-Daten...")
        
        # Test-User
        user = User(
            email="test@test.ch",
            hashed_password=get_password_hash("test123"),
            first_name="Test",
            last_name="User",
            role=UserRole.CUSTOMER,
            is_active=True
        )
        
        db.add(user)
        db.commit()
        
        # Test-Projekt
        project = Project(
            title="Test Projekt",
            description="Ein Test-Projekt",
            customer_id=user.id,
            status=ProjectStatus.DRAFT
        )
        
        db.add(project)
        db.commit()
        
        print("✅ Test-Daten erstellt!")
        
    except Exception as e:
        print(f"❌ Fehler: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    create_test_data()