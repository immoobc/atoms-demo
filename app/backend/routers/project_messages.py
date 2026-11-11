import json
from datetime import date, datetime
from typing import Optional

from core.database import get_db
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from services.project_messages import ProjectMessagesService
from sqlalchemy.ext.asyncio import AsyncSession
from dependencies.auth import get_current_user
from schemas.auth import UserResponse


router = APIRouter(prefix="/api/v1/entities/project_messages", tags=["project_messages"])


class ProjectMessagesData(BaseModel):
    project_id: int
    run_id: Optional[int] = None
    role: str
    content: str
    create_time: Optional[str] = None


class ProjectMessagesUpdateData(BaseModel):
    project_id: Optional[int] = None
    run_id: Optional[int] = None
    role: Optional[str] = None
    content: Optional[str] = None
    create_time: Optional[str] = None


class ProjectMessagesResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    run_id: Optional[int] = None
    role: str
    content: str
    create_time: Optional[str] = None
    user_id: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ProjectMessagesListResponse(BaseModel):
    items: list[ProjectMessagesResponse]
    total: int
    skip: int
    limit: int


def parse_query(value: str | None) -> dict | None:
    if not value:
        return None
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid query JSON") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="Query must be a JSON object")
    return parsed


@router.get("", response_model=ProjectMessagesListResponse)
async def query_items(
    query: str | None = Query(None),
    sort: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=2000),
    fields: str | None = Query(None),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await ProjectMessagesService(db).get_list(
            skip=skip, limit=limit, query=parse_query(query), sort=sort, user_id=str(current_user.id)
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/all", response_model=ProjectMessagesListResponse)
async def query_all_items(
    query: str | None = Query(None),
    sort: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=2000),
    fields: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await ProjectMessagesService(db).get_list(
            skip=skip, limit=limit, query=parse_query(query), sort=sort
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{item_id}", response_model=ProjectMessagesResponse)
async def get_item(
    item_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    item = await ProjectMessagesService(db).get_by_id(item_id, str(current_user.id))
    if item is None:
        raise HTTPException(status_code=404, detail="ProjectMessages not found")
    return item


@router.post("", response_model=ProjectMessagesResponse, status_code=201)
async def create_item(
    data: ProjectMessagesData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await ProjectMessagesService(db).create(data.model_dump(exclude_unset=True), str(current_user.id))


@router.put("/{item_id}", response_model=ProjectMessagesResponse)
async def update_item(
    item_id: int,
    data: ProjectMessagesUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    item = await ProjectMessagesService(db).update(
        item_id, data.model_dump(exclude_unset=True), str(current_user.id)
    )
    if item is None:
        raise HTTPException(status_code=404, detail="ProjectMessages not found")
    return item


@router.delete("/{item_id}")
async def delete_item(
    item_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    deleted = await ProjectMessagesService(db).delete(item_id, str(current_user.id))
    if not deleted:
        raise HTTPException(status_code=404, detail="ProjectMessages not found")
    return {"id": item_id, "deleted": True}
