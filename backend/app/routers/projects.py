from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.project import Project, ProjectStatus
from app.models.user import User
from app.schemas.project_schema import ProjectCreate
from app.auth import get_current_user

router = APIRouter(
    prefix="/api/projects",
    tags=["projects"]
)

@router.get("/", response_model=List[dict])
def get_all_projects(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    projects = db.query(Project).offset(skip).limit(limit).all()
    result = []
    for project in projects:
        result.append({
            "id": project.id,
            "title": project.title,
            "description": project.description,
            "status": project.status.value,
            "customer_id": project.customer_id
        })
    return result

@router.get("/{project_id}")
def get_project_by_id(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Projekt nicht gefunden"
        )
    return {
        "id": project.id,
        "title": project.title,
        "description": project.description,
        "status": project.status.value,
        "customer_id": project.customer_id
    }

@router.post("/create")
def create_project(
    project: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    new_project = Project(
        title=project.title,
        description=project.description,
        status=project.status,
        customer_id=current_user.id,
        strasse=project.strasse,
        plz=project.plz,
        ort=project.ort,
        gebaeudetyp=project.gebaeudetyp,
        kontrollart=project.kontrollart,
        energienachweise=project.energienachweise
    )
    db.add(new_project)
    db.commit()
    db.refresh(new_project)
    return {
        "id": new_project.id,
        "title": new_project.title,
        "status": new_project.status
    }
