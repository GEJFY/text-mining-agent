"""認証・認可 - JWT/RBAC/PII匿名化"""

from datetime import UTC, datetime, timedelta
from enum import Enum

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel

from app.core.config import settings


class UserRole(str, Enum):
    """ユーザーロール"""

    ADMIN = "admin"
    ANALYST = "analyst"
    VIEWER = "viewer"


class TokenData(BaseModel):
    user_id: str
    role: UserRole
    tenant_id: str
    exp: datetime


def create_access_token(user_id: str, role: UserRole, tenant_id: str) -> str:
    """JWTアクセストークン生成"""
    expire = datetime.now(UTC) + timedelta(minutes=settings.jwt_expiration_minutes)
    payload = {
        "sub": user_id,
        "role": role.value,
        "tenant_id": tenant_id,
        "exp": expire,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def verify_token(token: str) -> TokenData:
    """JWTトークン検証"""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
        return TokenData(
            user_id=payload["sub"],
            role=UserRole(payload["role"]),
            tenant_id=payload["tenant_id"],
            exp=datetime.fromtimestamp(payload["exp"], tz=UTC),
        )
    except JWTError as e:
        raise ValueError(f"Invalid token: {e}") from e


def hash_password(password: str) -> str:
    """bcryptでパスワードをハッシュ化（passlib不使用で互換性問題を回避）"""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """bcryptでパスワードを検証"""
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


# FastAPI Dependency: Bearer トークン認証
_bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> TokenData:
    """リクエストからJWTトークンを検証しユーザー情報を返す"""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="認証トークンが必要です",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        return verify_token(credentials.credentials)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="トークンが無効または期限切れです",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> TokenData | None:
    """トークンがあれば検証、なければNone（認証オプショナルなエンドポイント用）"""
    if credentials is None:
        return None
    try:
        return verify_token(credentials.credentials)
    except ValueError:
        return None
