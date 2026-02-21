"""分析結果のRedisキャッシュサービス

分析エンドポイントの結果をRedisにキャッシュし、
同一パラメータでの再実行を高速化する。
"""

import hashlib
import json
import logging

from redis.asyncio import Redis

from app.core.config import settings

logger = logging.getLogger(__name__)


class AnalysisCache:
    """分析結果のRedisキャッシュ"""

    def __init__(self) -> None:
        self._redis: Redis | None = None

    async def connect(self) -> None:
        """Redis接続を確立"""
        try:
            self._redis = Redis.from_url(settings.redis_url, decode_responses=True)
            await self._redis.ping()
            logger.info("Redis cache connected")
        except Exception:
            logger.warning("Redis cache unavailable, running without cache")
            self._redis = None

    async def close(self) -> None:
        """Redis接続を閉じる"""
        if self._redis:
            await self._redis.close()
            self._redis = None

    def _key(self, dataset_id: str, analysis_type: str, params: dict) -> str:
        """キャッシュキーを生成"""
        param_hash = hashlib.md5(json.dumps(params, sort_keys=True, default=str).encode()).hexdigest()[:8]
        return f"analysis:{dataset_id}:{analysis_type}:{param_hash}"

    async def get(self, dataset_id: str, analysis_type: str, params: dict) -> dict | None:
        """キャッシュから分析結果を取得"""
        if not self._redis:
            return None
        try:
            key = self._key(dataset_id, analysis_type, params)
            data = await self._redis.get(key)
            if data:
                logger.debug("Cache hit: %s", key)
                return json.loads(data)
        except Exception:
            logger.warning("Cache get failed", exc_info=True)
        return None

    async def set(
        self,
        dataset_id: str,
        analysis_type: str,
        params: dict,
        result: dict,
        ttl: int = 3600,
    ) -> None:
        """分析結果をキャッシュに保存"""
        if not self._redis:
            return
        try:
            key = self._key(dataset_id, analysis_type, params)
            await self._redis.set(key, json.dumps(result, default=str), ex=ttl)
            logger.debug("Cache set: %s (ttl=%ds)", key, ttl)
        except Exception:
            logger.warning("Cache set failed", exc_info=True)

    async def invalidate_dataset(self, dataset_id: str) -> None:
        """データセットに関連するキャッシュをすべて削除"""
        if not self._redis:
            return
        try:
            pattern = f"analysis:{dataset_id}:*"
            cursor = 0
            deleted = 0
            while True:
                cursor, keys = await self._redis.scan(cursor=cursor, match=pattern, count=100)
                if keys:
                    await self._redis.delete(*keys)
                    deleted += len(keys)
                if cursor == 0:
                    break
            if deleted:
                logger.info(
                    "Cache invalidated %d keys for dataset %s",
                    deleted,
                    dataset_id,
                )
        except Exception:
            logger.warning("Cache invalidation failed", exc_info=True)


analysis_cache = AnalysisCache()
