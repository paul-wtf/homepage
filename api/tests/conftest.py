from collections.abc import AsyncIterator

import httpx
import pytest

from homepage_api.main import create_app
from homepage_api.settings import Settings


@pytest.fixture
def settings() -> Settings:
    return Settings(lastfm_api_key="test-key", lastfm_user="someone")


@pytest.fixture
async def client(settings: Settings) -> AsyncIterator[httpx.AsyncClient]:
    app = create_app(settings)
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://testserver"
        ) as c,
    ):
        yield c
