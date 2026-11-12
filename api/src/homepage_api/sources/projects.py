import asyncio
from typing import Literal

import httpx

from homepage_api.settings import Settings

State = Literal["up", "down"]


async def _check(client: httpx.AsyncClient, url: str) -> State:
    try:
        resp = await client.get(url)
    except httpx.HTTPError:
        return "down"
    return "up" if resp.status_code < 400 else "down"


async def fetch_projects(client: httpx.AsyncClient, settings: Settings) -> dict[str, State] | None:
    urls = settings.project_urls
    if not urls:
        return None
    states = await asyncio.gather(*(_check(client, url) for url in urls.values()))
    return dict(zip(urls, states, strict=True))
