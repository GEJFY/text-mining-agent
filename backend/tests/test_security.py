"""認証・セキュリティモジュールテスト

JWT生成/検証、パスワードハッシュ/検証、
get_current_user / get_optional_user / require_role Dependency。
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.core.security import (
    TokenData,
    UserRole,
    create_access_token,
    get_current_user,
    get_optional_user,
    hash_password,
    require_role,
    verify_password,
    verify_token,
)

# === パスワードハッシュ ===


def test_hash_password_returns_string():
    """hash_passwordがbcryptハッシュ文字列を返す"""
    hashed = hash_password("testpass123")
    assert isinstance(hashed, str)
    assert hashed.startswith("$2")


def test_verify_password_correct():
    """正しいパスワードでverify_password=True"""
    hashed = hash_password("mypassword")
    assert verify_password("mypassword", hashed) is True


def test_verify_password_incorrect():
    """誤ったパスワードでverify_password=False"""
    hashed = hash_password("correctpass")
    assert verify_password("wrongpass", hashed) is False


def test_hash_password_unique():
    """同じパスワードでも異なるハッシュ（salt違い）"""
    h1 = hash_password("samepass")
    h2 = hash_password("samepass")
    assert h1 != h2
    assert verify_password("samepass", h1) is True
    assert verify_password("samepass", h2) is True


# === JWT トークン ===


def test_create_and_verify_token():
    """トークン生成→検証でユーザー情報が復元される"""
    token = create_access_token("user-001", UserRole.ANALYST, "tenant-001")
    data = verify_token(token)
    assert isinstance(data, TokenData)
    assert data.user_id == "user-001"
    assert data.role == UserRole.ANALYST
    assert data.tenant_id == "tenant-001"
    assert data.exp > datetime.now(UTC)


def test_create_token_admin_role():
    """ADMINロールのトークン"""
    token = create_access_token("admin-001", UserRole.ADMIN, "tenant-admin")
    data = verify_token(token)
    assert data.role == UserRole.ADMIN


def test_create_token_viewer_role():
    """VIEWERロールのトークン"""
    token = create_access_token("viewer-001", UserRole.VIEWER, "tenant-v")
    data = verify_token(token)
    assert data.role == UserRole.VIEWER


def test_verify_token_invalid():
    """不正トークンでValueError"""
    with pytest.raises(ValueError, match="Invalid token"):
        verify_token("invalid.token.string")


def test_verify_token_tampered():
    """改ざんトークンでValueError"""
    token = create_access_token("user-001", UserRole.ANALYST, "tenant-001")
    tampered = token[:-5] + "XXXXX"
    with pytest.raises(ValueError, match="Invalid token"):
        verify_token(tampered)


# === get_current_user ===


@pytest.mark.asyncio
async def test_get_current_user_no_credentials():
    """認証情報なしで401"""
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(credentials=None)
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_valid_token():
    """有効トークンでTokenDataを返す"""
    token = create_access_token("user-001", UserRole.ANALYST, "tenant-001")
    creds = AsyncMock()
    creds.credentials = token
    result = await get_current_user(credentials=creds)
    assert result.user_id == "user-001"
    assert result.role == UserRole.ANALYST


@pytest.mark.asyncio
async def test_get_current_user_invalid_token():
    """無効トークンで401"""
    creds = AsyncMock()
    creds.credentials = "bad.token.value"
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(credentials=creds)
    assert exc_info.value.status_code == 401


# === get_optional_user ===


@pytest.mark.asyncio
async def test_get_optional_user_no_credentials():
    """認証情報なしでNone"""
    result = await get_optional_user(credentials=None)
    assert result is None


@pytest.mark.asyncio
async def test_get_optional_user_valid_token():
    """有効トークンでTokenData"""
    token = create_access_token("user-002", UserRole.VIEWER, "tenant-002")
    creds = AsyncMock()
    creds.credentials = token
    result = await get_optional_user(credentials=creds)
    assert result is not None
    assert result.user_id == "user-002"


@pytest.mark.asyncio
async def test_get_optional_user_invalid_token():
    """無効トークンでNone（例外ではない）"""
    creds = AsyncMock()
    creds.credentials = "invalid.token"
    result = await get_optional_user(credentials=creds)
    assert result is None


# === require_role ===


@pytest.mark.asyncio
async def test_require_role_allowed():
    """許可ロールでアクセス成功"""
    checker = require_role(UserRole.ADMIN, UserRole.ANALYST)
    user = TokenData(
        user_id="u1",
        role=UserRole.ANALYST,
        tenant_id="t1",
        exp=datetime.now(UTC) + timedelta(hours=1),
    )
    result = await checker(current_user=user)
    assert result.user_id == "u1"


@pytest.mark.asyncio
async def test_require_role_denied():
    """不許可ロールで403"""
    checker = require_role(UserRole.ADMIN)
    user = TokenData(
        user_id="u2",
        role=UserRole.VIEWER,
        tenant_id="t1",
        exp=datetime.now(UTC) + timedelta(hours=1),
    )
    with pytest.raises(HTTPException) as exc_info:
        await checker(current_user=user)
    assert exc_info.value.status_code == 403


# === UserRole ===


def test_user_role_values():
    """UserRoleの列挙値"""
    assert UserRole.ADMIN.value == "admin"
    assert UserRole.ANALYST.value == "analyst"
    assert UserRole.VIEWER.value == "viewer"
