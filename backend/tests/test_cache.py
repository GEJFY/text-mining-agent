"""Sprint 11: Redisキャッシュサービスのテスト"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.cache import AnalysisCache


@pytest.fixture
def mock_redis():
    """モックRedisクライアント"""
    redis = AsyncMock()
    redis.ping = AsyncMock()
    redis.get = AsyncMock(return_value=None)
    redis.set = AsyncMock()
    redis.delete = AsyncMock()
    redis.scan = AsyncMock(return_value=(0, []))
    redis.close = AsyncMock()
    return redis


@pytest.fixture
def cache(mock_redis):
    """テスト用キャッシュインスタンス"""
    c = AnalysisCache()
    c._redis = mock_redis
    return c


@pytest.mark.asyncio
async def test_cache_get_miss(cache, mock_redis):
    """キャッシュミス時にNoneを返す"""
    mock_redis.get = AsyncMock(return_value=None)
    result = await cache.get("ds-001", "cluster", {"n_clusters": 5})
    assert result is None


@pytest.mark.asyncio
async def test_cache_get_hit(cache, mock_redis):
    """キャッシュヒット時にデータを返す"""
    import json

    cached_data = {"clusters": [{"title": "test", "size": 3}]}
    mock_redis.get = AsyncMock(return_value=json.dumps(cached_data))
    result = await cache.get("ds-001", "cluster", {"n_clusters": 5})
    assert result == cached_data


@pytest.mark.asyncio
async def test_cache_set(cache, mock_redis):
    """キャッシュ保存が正常に動作する"""
    data = {"clusters": [{"title": "test"}]}
    await cache.set("ds-001", "cluster", {"n_clusters": 5}, data, ttl=3600)
    mock_redis.set.assert_called_once()
    call_args = mock_redis.set.call_args
    assert call_args.kwargs.get("ex") == 3600 or call_args[1].get("ex") == 3600


@pytest.mark.asyncio
async def test_cache_invalidate_dataset(cache, mock_redis):
    """データセットのキャッシュ無効化"""
    mock_redis.scan = AsyncMock(return_value=(0, ["analysis:ds-001:cluster:abc", "analysis:ds-001:sentiment:def"]))
    await cache.invalidate_dataset("ds-001")
    mock_redis.delete.assert_called_once()


@pytest.mark.asyncio
async def test_cache_invalidate_no_keys(cache, mock_redis):
    """キャッシュキーが無い場合は何もしない"""
    mock_redis.scan = AsyncMock(return_value=(0, []))
    await cache.invalidate_dataset("ds-999")
    mock_redis.delete.assert_not_called()


@pytest.mark.asyncio
async def test_cache_key_uniqueness(cache):
    """異なるパラメータで異なるキーが生成される"""
    key1 = cache._key("ds-001", "cluster", {"n_clusters": 5})
    key2 = cache._key("ds-001", "cluster", {"n_clusters": 10})
    key3 = cache._key("ds-001", "sentiment", {"n_clusters": 5})
    assert key1 != key2
    assert key1 != key3


@pytest.mark.asyncio
async def test_cache_no_redis_graceful():
    """Redis未接続でもエラーにならない"""
    cache = AnalysisCache()
    # _redis is None
    result = await cache.get("ds-001", "cluster", {})
    assert result is None
    await cache.set("ds-001", "cluster", {}, {"test": True})
    await cache.invalidate_dataset("ds-001")


@pytest.mark.asyncio
async def test_cache_connect_failure():
    """Redis接続失敗時にgracefulにフォールバック"""
    cache = AnalysisCache()
    with patch("app.services.cache.Redis") as mock_cls:
        mock_instance = AsyncMock()
        mock_instance.ping = AsyncMock(side_effect=ConnectionError("refused"))
        mock_cls.from_url = MagicMock(return_value=mock_instance)
        await cache.connect()
    assert cache._redis is None
