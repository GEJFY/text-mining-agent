"""認証・認可 - JWT/RBAC/PII匿名化"""

from datetime import UTC, datetime, timedelta
from enum import Enum

from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


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
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)
