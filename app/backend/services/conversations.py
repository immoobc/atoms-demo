from datetime import date, datetime
from typing import Any

from models.conversations import Conversations
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.types import Boolean, Date, DateTime, Float, Integer


class ConversationsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _coerce(column: Any, value: Any) -> Any:
        column_type = column.property.columns[0].type
        if value is None or not isinstance(value, str):
            return value
        if isinstance(column_type, DateTime):
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        if isinstance(column_type, Date):
            return date.fromisoformat(value)
        if isinstance(column_type, Boolean):
            normalized = value.strip().lower()
            if normalized in {"true", "1", "yes"}:
                return True
            if normalized in {"false", "0", "no"}:
                return False
            raise ValueError(f"Invalid boolean value: {value}")
        if isinstance(column_type, Integer):
            return int(value)
        if isinstance(column_type, Float):
            return float(value)
        return value

    @classmethod
    def _conditions(cls, query: dict[str, Any] | None) -> list[Any]:
        conditions = []
        operators = {
            "$eq": lambda column, value: column == value,
            "$gte": lambda column, value: column >= value,
            "$lte": lambda column, value: column <= value,
            "$gt": lambda column, value: column > value,
            "$lt": lambda column, value: column < value,
        }
        for field, raw_value in (query or {}).items():
            if not hasattr(Conversations, field):
                raise ValueError(f"Unknown query field: {field}")
            column = getattr(Conversations, field)
            if isinstance(raw_value, dict) and any(str(key).startswith("$") for key in raw_value):
                for operator, value in raw_value.items():
                    normalized = str(operator).lower()
                    if normalized not in operators:
                        raise ValueError(f"Unsupported query operator: {operator}")
                    conditions.append(operators[normalized](column, cls._coerce(column, value)))
            else:
                conditions.append(column == cls._coerce(column, raw_value))
        return conditions

    async def create(self, data: dict[str, Any], user_id: str | None = None) -> Conversations:
        payload = dict(data)
        payload['user_id'] = user_id
        item = Conversations(**payload)
        self.db.add(item)
        await self.db.commit()
        await self.db.refresh(item)
        return item

    async def get_by_id(self, item_id: int, user_id: str | None = None) -> Conversations | None:
        statement = select(Conversations).where(Conversations.id == item_id)
        statement = statement.where(Conversations.user_id == user_id)
        result = await self.db.execute(statement)
        return result.scalar_one_or_none()

    async def get_list(
        self,
        *,
        skip: int = 0,
        limit: int = 20,
        query: dict[str, Any] | None = None,
        sort: str | None = None,
        user_id: str | None = None,
    ) -> dict[str, Any]:
        conditions = self._conditions(query)
        statement = select(Conversations)
        count_statement = select(func.count()).select_from(Conversations)
        if user_id:
            statement = statement.where(Conversations.user_id == user_id)
            count_statement = count_statement.where(Conversations.user_id == user_id)
        for condition in conditions:
            statement = statement.where(condition)
            count_statement = count_statement.where(condition)

        sort_field = (sort or "-id").lstrip("-")
        if not hasattr(Conversations, sort_field):
            raise ValueError(f"Unknown sort field: {sort_field}")
        sort_column = getattr(Conversations, sort_field)
        statement = statement.order_by(sort_column.desc() if (sort or "-id").startswith("-") else sort_column.asc())
        result = await self.db.execute(statement.offset(skip).limit(limit))
        total = int((await self.db.execute(count_statement)).scalar_one())
        return {"items": list(result.scalars().all()), "total": total, "skip": skip, "limit": limit}

    async def update(self, item_id: int, data: dict[str, Any], user_id: str | None = None) -> Conversations | None:
        item = await self.get_by_id(item_id, user_id)
        if item is None:
            return None
        for field, value in data.items():
            if field not in {"id", "user_id", "created_at", "updated_at"} and hasattr(item, field):
                setattr(item, field, value)
        await self.db.commit()
        await self.db.refresh(item)
        return item

    async def delete(self, item_id: int, user_id: str | None = None) -> bool:
        item = await self.get_by_id(item_id, user_id)
        if item is None:
            return False
        await self.db.delete(item)
        await self.db.commit()
        return True
