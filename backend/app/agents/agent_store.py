"""Redis-backed agent state persistence"""

import json

import redis.asyncio as aioredis

from app.core.config import settings

AGENT_KEY_PREFIX = "nexustext:agent:"
AGENT_TTL = 86400  # 24時間


class AgentStore:
    def __init__(self) -> None:
        self._redis: aioredis.Redis | None = None

    async def _get_redis(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(settings.redis_url, decode_responses=True)
        return self._redis

    async def save(self, agent_id: str, state: dict) -> None:
        r = await self._get_redis()
        key = f"{AGENT_KEY_PREFIX}{agent_id}"
        await r.set(key, json.dumps(state, ensure_ascii=False, default=str), ex=AGENT_TTL)

    async def load(self, agent_id: str) -> dict | None:
        r = await self._get_redis()
        key = f"{AGENT_KEY_PREFIX}{agent_id}"
        raw = await r.get(key)
        return json.loads(raw) if raw else None

    async def delete(self, agent_id: str) -> None:
        r = await self._get_redis()
        await r.delete(f"{AGENT_KEY_PREFIX}{agent_id}")


agent_store = AgentStore()
