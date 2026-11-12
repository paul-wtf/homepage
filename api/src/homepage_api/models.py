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


class WeekArtist(BaseModel):
    name: str
    count: int
    image: str | None = None


class WeekTrack(BaseModel):
    track: str
    artist: str
    count: int


class Week(BaseModel):
    listens: int
    seconds: int
    artists: list[WeekArtist]
    tracks: list[WeekTrack]
    grid: list[list[int]]
    url: str


class Status(BaseModel):
    music: Music | None = None
    server: Server | None = None
    weather: Weather | None = None
    projects: dict[str, Literal["up", "down"]] | None = None
    week: Week | None = None
    generated_at: datetime

    @field_serializer("generated_at")
    def _serialize_generated_at(self, value: datetime) -> str:
        return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
