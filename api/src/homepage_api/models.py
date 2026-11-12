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


class ClusterNode(BaseModel):
    name: str
    ready: bool | None = None
    uptime_s: int | None = None
    storage_used: int | None = None
    storage_total: int | None = None


class Kubernetes(BaseModel):
    version: str
    distribution: str | None = None


class Cluster(BaseModel):
    nodes_total: int | None = None
    nodes_ready: int | None = None
    pods: int | None = None
    workloads: int | None = None
    services: int | None = None
    kubernetes: Kubernetes | None = None
    nodes: list[ClusterNode] = []
    storage_used: int | None = None
    storage_total: int | None = None
    cpu_temp_c: float | None = None
    nvme_temp_c: float | None = None


class Status(BaseModel):
    music: Music | None = None
    server: Server | None = None
    weather: Weather | None = None
    projects: dict[str, Literal["up", "down"]] | None = None
    week: Week | None = None
    cluster: Cluster | None = None
    generated_at: datetime

    @field_serializer("generated_at")
    def _serialize_generated_at(self, value: datetime) -> str:
        return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
