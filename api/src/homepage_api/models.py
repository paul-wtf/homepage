from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, field_serializer


class Music(BaseModel):
    state: Literal["playing", "recent"]
    track: str
    artist: str
    album: str | None = None
    image: str | None = None
    url: str | None = None
    played_at: datetime | None = None


class Server(BaseModel):
    load1: float
    cpu_pct: float
    mem_pct: float
    uptime_s: int
    cpu_history: list[float]


class Weather(BaseModel):
    temp_c: float
    code: int
    is_day: bool
    wind_kmh: float


class Status(BaseModel):
    music: Music | None = None
    server: Server | None = None
    weather: Weather | None = None
    generated_at: datetime

    @field_serializer("generated_at")
    def _serialize_generated_at(self, value: datetime) -> str:
        return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
