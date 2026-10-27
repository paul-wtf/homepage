import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime

import httpx
from fastapi import FastAPI, Request, Response

from homepage_api.cache import CachedSource
from homepage_api.models import Status
from homepage_api.settings import Settings
from homepage_api.sources.lastfm import fetch_music
from homepage_api.sources.prometheus import fetch_server
from homepage_api.sources.weather import fetch_weather


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    logging.getLogger("httpx").setLevel(logging.WARNING)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        async with httpx.AsyncClient(timeout=3.0) as client:
            app.state.sources = {
                "music": CachedSource(
                    lambda: fetch_music(client, settings, datetime.now(UTC)),
                    ttl=20,
                    name="music",
                ),
                "server": CachedSource(
                    lambda: fetch_server(client, settings, datetime.now(UTC)),
                    ttl=15,
                    name="server",
                ),
                "weather": CachedSource(
                    lambda: fetch_weather(client, settings),
                    ttl=600,
                    name="weather",
                ),
            }
            yield

    app = FastAPI(title="homepage-api", lifespan=lifespan)

    @app.get("/api/status", response_model=Status)
    async def status(request: Request, response: Response) -> Status:
        response.headers["Cache-Control"] = "public, max-age=15"
        sources = request.app.state.sources
        results = await asyncio.gather(*(source.get() for source in sources.values()))
        values = dict(zip(sources, results, strict=True))
        return Status(**values, generated_at=datetime.now(UTC))

    @app.get("/api/healthz")
    async def healthz() -> dict[str, bool]:
        return {"ok": True}

    return app


app = create_app()
