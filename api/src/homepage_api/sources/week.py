import asyncio

import httpx

from homepage_api.models import Week, WeekArtist, WeekTrack
from homepage_api.settings import Settings

TOP = 5


def _https(value: object) -> str | None:
    return value if isinstance(value, str) and value.startswith("https://") else None


async def _get(client: httpx.AsyncClient, url: str, params: dict | None = None):
    try:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as exc:
        raise RuntimeError(f"tidalwave HTTP {exc.response.status_code}") from None
    except (httpx.HTTPError, ValueError) as exc:
        raise RuntimeError(f"tidalwave request failed: {type(exc).__name__}") from None


async def fetch_week(client: httpx.AsyncClient, settings: Settings) -> Week | None:
    token = settings.tidalwave_share_token
    if not token:
        return None
    base = settings.tidalwave_url.rstrip("/")
    shared = f"{base}/shared/{token}"
    summary, artists, tracks, grid = await asyncio.gather(
        _get(client, f"{shared}/summary"),
        _get(client, f"{shared}/top-artists", {"limit": TOP}),
        _get(client, f"{shared}/top-tracks", {"limit": TOP}),
        _get(client, f"{shared}/hour-weekday"),
    )
    if len(grid) != 7 or any(len(row) != 24 for row in grid):
        raise RuntimeError("tidalwave returned a malformed grid")
    return Week(
        listens=summary["total_listens"],
        seconds=summary["total_seconds"],
        artists=[
            WeekArtist(name=a["artist"], count=a["count"], image=_https(a.get("image_url")))
            for a in artists
        ],
        tracks=[WeekTrack(track=t["track"], artist=t["artist"], count=t["count"]) for t in tracks],
        grid=grid,
        url=f"{base}/s/{token}",
    )
