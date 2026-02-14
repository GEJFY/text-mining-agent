"""Dead Letter Queue (DLQ) のテスト"""

import json
from unittest.mock import AsyncMock, patch

import pytest

from app.services.dlq import DLQ_KEY, DeadLetterQueue


class TestDeadLetterQueue:
    """DLQ の基本動作テスト"""

    @pytest.fixture
    def dlq(self) -> DeadLetterQueue:
        return DeadLetterQueue()

    @pytest.mark.asyncio
    async def test_enqueue(self, dlq: DeadLetterQueue) -> None:
        """enqueue が Redis lpush を呼ぶこと"""
        mock_redis = AsyncMock()
        mock_redis.lpush = AsyncMock(return_value=1)
        mock_redis.ltrim = AsyncMock()

        with patch.object(dlq, "_get_redis", return_value=mock_redis):
            await dlq.enqueue(
                prompt="Test prompt",
                system_prompt="System",
                model="claude-opus-4-6",
                task_type="labeling",
                error="Model unavailable",
            )

        mock_redis.lpush.assert_called_once()
        call_args = mock_redis.lpush.call_args
        assert call_args[0][0] == DLQ_KEY
        entry = json.loads(call_args[0][1])
        assert entry["model"] == "claude-opus-4-6"
        assert entry["task_type"] == "labeling"
        assert entry["retry_count"] == 0

    @pytest.mark.asyncio
    async def test_dequeue(self, dlq: DeadLetterQueue) -> None:
        """dequeue が Redis rpop からJSONパースされること"""
        entry = {"model": "gpt-5.2", "prompt": "test", "task_type": "summarization"}
        mock_redis = AsyncMock()
        mock_redis.rpop = AsyncMock(return_value=json.dumps(entry))

        with patch.object(dlq, "_get_redis", return_value=mock_redis):
            result = await dlq.dequeue()

        assert result is not None
        assert result["model"] == "gpt-5.2"

    @pytest.mark.asyncio
    async def test_dequeue_empty(self, dlq: DeadLetterQueue) -> None:
        """キューが空の場合にNoneが返ること"""
        mock_redis = AsyncMock()
        mock_redis.rpop = AsyncMock(return_value=None)

        with patch.object(dlq, "_get_redis", return_value=mock_redis):
            result = await dlq.dequeue()

        assert result is None

    @pytest.mark.asyncio
    async def test_size(self, dlq: DeadLetterQueue) -> None:
        """size が Redis llen 結果を返すこと"""
        mock_redis = AsyncMock()
        mock_redis.llen = AsyncMock(return_value=42)

        with patch.object(dlq, "_get_redis", return_value=mock_redis):
            result = await dlq.size()

        assert result == 42

    @pytest.mark.asyncio
    async def test_peek(self, dlq: DeadLetterQueue) -> None:
        """peek が Redis lrange 結果をリスト変換すること"""
        entries = [
            json.dumps({"model": "m1", "prompt": "p1"}),
            json.dumps({"model": "m2", "prompt": "p2"}),
        ]
        mock_redis = AsyncMock()
        mock_redis.lrange = AsyncMock(return_value=entries)

        with patch.object(dlq, "_get_redis", return_value=mock_redis):
            result = await dlq.peek(count=2)

        assert len(result) == 2
        # reversed order (FIFO view)
        assert result[0]["model"] == "m2"
        assert result[1]["model"] == "m1"

    @pytest.mark.asyncio
    async def test_close(self, dlq: DeadLetterQueue) -> None:
        """close が Redis 接続を閉じること"""
        mock_redis = AsyncMock()
        mock_redis.close = AsyncMock()
        dlq._redis = mock_redis

        await dlq.close()

        mock_redis.close.assert_called_once()
        assert dlq._redis is None

    @pytest.mark.asyncio
    async def test_enqueue_truncates_long_prompt(self, dlq: DeadLetterQueue) -> None:
        """長いプロンプトが切り詰められること"""
        mock_redis = AsyncMock()
        mock_redis.lpush = AsyncMock(return_value=1)
        mock_redis.ltrim = AsyncMock()

        long_prompt = "a" * 5000

        with patch.object(dlq, "_get_redis", return_value=mock_redis):
            await dlq.enqueue(
                prompt=long_prompt,
                system_prompt="System",
                model="test-model",
                task_type="test",
                error="test error",
            )

        call_args = mock_redis.lpush.call_args
        entry = json.loads(call_args[0][1])
        assert len(entry["prompt"]) == 2000
