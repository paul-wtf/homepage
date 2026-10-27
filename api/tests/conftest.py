from collections.abc import AsyncIterator, Callable

import httpx
import pytest
import respx

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


@pytest.fixture
def sources_down(respx_mock: respx.MockRouter, settings: Settings) -> Callable[..., None]:
    urls = {
        "music": "https://ws.audioscrobbler.com/2.0/",
        "server": f"{settings.prometheus_url}/api/v1/",
        "weather": "https://api.open-meteo.com/v1/forecast",
    }

    def mock(*names: str) -> None:
        for name in names:
            respx_mock.get(url__startswith=urls[name]).mock(return_value=httpx.Response(500))

    return mock
