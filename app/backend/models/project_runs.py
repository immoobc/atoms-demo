from datetime import date, datetime, timezone
from typing import Any, Optional

from core.database import Base
from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column


class ProjectRuns(Base):
    __tablename__ = 'project_runs'
    __table_args__ = {"extend_existing": True}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, nullable=False, autoincrement=True)
    project_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    stage: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    lead_output: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    dev_output: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    qa_output: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    qa_first_output: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    files: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    fix_rounds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    memory_events: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    create_time: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    update_time: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    user_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
