import httpx

from homepage_api.models import Weather
from homepage_api.settings import Settings

API_URL = "https://api.open-meteo.com/v1/forecast"


async def fetch_weather(client: httpx.AsyncClient, settings: Settings) -> Weather | None:
    if settings.weather_lat is None or settings.weather_lon is None:
        return None
    try:
        resp = await client.get(
            API_URL,
            params={
                "latitude": settings.weather_lat,
                "longitude": settings.weather_lon,
                "current": "temperature_2m,weather_code,is_day,wind_speed_10m",
                "timezone": "Europe/Berlin",
            },
        )
        resp.raise_for_status()
        data = resp.json()
    except httpx.HTTPStatusError as exc:
        raise RuntimeError(f"Open-Meteo HTTP {exc.response.status_code}") from None
    except (httpx.HTTPError, ValueError) as exc:
        raise RuntimeError(f"Open-Meteo request failed: {type(exc).__name__}") from None
    try:
        current = data["current"]
        return Weather(
            temp_c=current["temperature_2m"],
            code=current["weather_code"],
            is_day=bool(current["is_day"]),
            wind_kmh=current["wind_speed_10m"],
        )
    except (KeyError, TypeError, ValueError):
        raise RuntimeError("Open-Meteo response had an unexpected shape") from None
