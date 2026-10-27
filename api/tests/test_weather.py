import httpx
import pytest
import respx

from homepage_api.settings import Settings
from homepage_api.sources.weather import fetch_weather

API = "https://api.open-meteo.com/v1/forecast"


def payload(**overrides) -> dict:
    current = {
        "time": "2026-10-27T10:00",
        "interval": 900,
        "temperature_2m": 7.4,
        "weather_code": 3,
        "is_day": 1,
        "wind_speed_10m": 11.2,
    }
    return {"latitude": 48.13, "longitude": 12.38, "current": {**current, **overrides}}


def mock(respx_mock: respx.MockRouter, body: dict, status: int = 200) -> respx.Route:
    return respx_mock.get(API).mock(return_value=httpx.Response(status, json=body))


async def run(settings: Settings):
    async with httpx.AsyncClient(timeout=3.0) as client:
        return await fetch_weather(client, settings)


async def test_weather_current(respx_mock, settings):
    mock(respx_mock, payload())
    weather = await run(settings)
    assert weather is not None
    assert weather.model_dump() == {"temp_c": 7.4, "code": 3, "is_day": True, "wind_kmh": 11.2}


async def test_weather_night(respx_mock, settings):
    mock(respx_mock, payload(is_day=0))
    weather = await run(settings)
    assert weather is not None
    assert weather.is_day is False


async def test_weather_request_params(respx_mock, settings):
    route = mock(respx_mock, payload())
    await run(settings)
    params = route.calls.last.request.url.params
    assert params["latitude"] == str(settings.weather_lat)
    assert params["longitude"] == str(settings.weather_lon)
    assert params["current"] == "temperature_2m,weather_code,is_day,wind_speed_10m"
    assert params["timezone"] == "Europe/Berlin"


def test_weather_default_coordinates_are_bierwang():
    settings = Settings()
    assert settings.weather_lat == pytest.approx(48.13, abs=0.05)
    assert settings.weather_lon == pytest.approx(12.39, abs=0.05)


async def test_weather_http_error_raises(respx_mock, settings):
    mock(respx_mock, {}, status=500)
    with pytest.raises(RuntimeError, match="HTTP 500"):
        await run(settings)


async def test_weather_timeout_raises(respx_mock, settings):
    respx_mock.get(API).mock(side_effect=httpx.ConnectTimeout("slow"))
    with pytest.raises(RuntimeError, match="ConnectTimeout"):
        await run(settings)


async def test_weather_missing_current_raises(respx_mock, settings):
    mock(respx_mock, {"latitude": 1, "longitude": 2})
    with pytest.raises(RuntimeError, match="unexpected"):
        await run(settings)


async def test_weather_null_field_raises(respx_mock, settings):
    mock(respx_mock, payload(temperature_2m=None))
    with pytest.raises(RuntimeError, match="unexpected"):
        await run(settings)


async def test_status_returns_weather(client, respx_mock):
    respx_mock.get("https://ws.audioscrobbler.com/2.0/").mock(return_value=httpx.Response(500))
    mock(respx_mock, payload())
    body = (await client.get("/api/status")).json()
    assert body["weather"] == {"temp_c": 7.4, "code": 3, "is_day": True, "wind_kmh": 11.2}


async def test_status_weather_null_on_error(client, respx_mock):
    respx_mock.get("https://ws.audioscrobbler.com/2.0/").mock(return_value=httpx.Response(500))
    mock(respx_mock, {}, status=500)
    resp = await client.get("/api/status")
    assert resp.status_code == 200
    assert resp.json()["weather"] is None
