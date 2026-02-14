"""Dead Letter Queue (DLQ) - 失敗したLLMリクエストの永続化

全モデルが失敗した場合にRedisにリクエストを保存し、後からリトライ可能にする。
"""

import json
from datetime import UTC, datetime

import redis.asyncio as aioredis

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

DLQ_KEY = "nexustext:dlq:llm_requests"
DLQ_MAX_SIZE = 10000


class DeadLetterQueue:
    """Redis Listベースの簡易DLQ"""

    def __init__(self) -> None:
        self._redis: aioredis.Redis | None = None

    async def _get_redis(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(settings.redis_url, decode_responses=True)
        return self._redis

    async def enqueue(
        self,
        *,
        prompt: str,
        system_prompt: str,
        model: str,
        task_type: str,
        error: str,
        correlation_id: str = "",
    ) -> None:
        """失敗したLLMリクエストをDLQに投入"""
        r = await self._get_redis()
        entry = {
            "prompt": prompt[:2000],  # 長すぎるプロンプトは切り詰め
            "system_prompt": system_prompt[:500],
            "model": model,
            "task_type": task_type,
            "error": str(error)[:500],
            "correlation_id": correlation_id,
            "enqueued_at": datetime.now(UTC).isoformat(),
            "retry_count": 0,
        }
        try:
            await r.lpush(DLQ_KEY, json.dumps(entry, ensure_ascii=False))
            await r.ltrim(DLQ_KEY, 0, DLQ_MAX_SIZE - 1)
            logger.info("dlq_enqueued", model=model, task_type=task_type)
        except Exception as e:
            logger.error("dlq_enqueue_failed", error=str(e))

    async def dequeue(self) -> dict | None:
        """DLQからリクエストを取り出す (FIFO)"""
        r = await self._get_redis()
        try:
            raw = await r.rpop(DLQ_KEY)
            if raw:
                return json.loads(raw)
            return None
        except Exception as e:
            logger.error("dlq_dequeue_failed", error=str(e))
            return None

    async def size(self) -> int:
        """DLQ内のリクエスト数"""
        r = await self._get_redis()
        try:
            return await r.llen(DLQ_KEY)
        except Exception:
            return -1

    async def peek(self, count: int = 10) -> list[dict]:
        """DLQの先頭をプレビュー（取り出さない）"""
        r = await self._get_redis()
        try:
            items = await r.lrange(DLQ_KEY, -count, -1)
            return [json.loads(item) for item in reversed(items)]
        except Exception:
            return []

    async def close(self) -> None:
        if self._redis:
            await self._redis.close()
            self._redis = None


# シングルトン
dlq = DeadLetterQueue()
