from datetime import date, datetime, timezone
from typing import Any, Optional

from core.database import Base
from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column


class ProjectMessages(Base):
    __tablename__ = 'project_messages'
    __table_args__ = {"extend_existing": True}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, nullable=False, autoincrement=True)
    project_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    run_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    role: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    create_time: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    user_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
