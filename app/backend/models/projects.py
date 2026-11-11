from datetime import date, datetime, timezone
from typing import Any, Optional

from core.database import Base
from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column


class Projects(Base):
    __tablename__ = 'projects'
    __table_args__ = {"extend_existing": True}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, nullable=False, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    goal: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    background: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    acceptance: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    create_time: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    update_time: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    user_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
