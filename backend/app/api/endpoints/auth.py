"""認証エンドポイント - ユーザー登録・ログイン"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.logging import get_logger
from app.core.security import (
    TokenData,
    UserRole,
    create_access_token,
    get_current_user,
    hash_password,
    require_role,
    verify_password,
)
from app.models.orm import User

logger = get_logger(__name__)

router = APIRouter()


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    display_name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    display_name: str
    role: str


class UserInfoResponse(BaseModel):
    user_id: str
    email: str
    display_name: str
    role: str
    tenant_id: str


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """新規ユーザー登録"""
    # メールアドレスの重複チェック
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="このメールアドレスは既に登録されています",
        )

    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        display_name=body.display_name,
        role=UserRole.ANALYST.value,
    )
    db.add(user)
    await db.flush()

    token = create_access_token(user.id, UserRole.ANALYST, user.tenant_id)
    logger.info("user_registered", user_id=user.id, email=body.email)

    return TokenResponse(
        access_token=token,
        user_id=user.id,
        display_name=user.display_name,
        role=user.role,
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """ログイン"""
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="メールアドレスまたはパスワードが正しくありません",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="アカウントが無効です",
        )

    token = create_access_token(user.id, UserRole(user.role), user.tenant_id)
    logger.info("user_login", user_id=user.id)

    return TokenResponse(
        access_token=token,
        user_id=user.id,
        display_name=user.display_name,
        role=user.role,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """アクセストークンをリフレッシュ（有効なトークンで新トークンを発行）"""
    result = await db.execute(select(User).where(User.id == current_user.user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="ユーザーが無効です")

    new_token = create_access_token(user.id, UserRole(user.role), user.tenant_id)
    return TokenResponse(
        access_token=new_token,
        user_id=user.id,
        display_name=user.display_name,
        role=user.role,
    )


@router.get("/me", response_model=UserInfoResponse)
async def get_me(
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """現在のユーザー情報を取得"""
    result = await db.execute(select(User).where(User.id == current_user.user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return UserInfoResponse(
        user_id=current_user.user_id,
        email=user.email,
        display_name=user.display_name,
        role=current_user.role.value,
        tenant_id=current_user.tenant_id,
    )


# === 管理者専用エンドポイント ===


@router.get("/users")
async def list_users(
    db: AsyncSession = Depends(get_db),
    _current_user: TokenData = Depends(require_role(UserRole.ADMIN)),
) -> dict:
    """ユーザー一覧（管理者のみ）"""
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    return {
        "users": [
            {
                "id": u.id,
                "email": u.email,
                "display_name": u.display_name,
                "role": u.role,
                "is_active": u.is_active,
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in users
        ]
    }


class RoleUpdateRequest(BaseModel):
    role: str


@router.put("/users/{user_id}/role")
async def update_user_role(
    user_id: str,
    body: RoleUpdateRequest,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenData = Depends(require_role(UserRole.ADMIN)),
) -> dict:
    """ユーザーのロール変更（管理者のみ）"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if body.role not in ("admin", "analyst", "viewer"):
        raise HTTPException(status_code=400, detail="Invalid role")
    user.role = body.role
    await db.flush()
    return {"success": True, "user_id": user_id, "role": body.role}


@router.put("/users/{user_id}/active")
async def toggle_user_active(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenData = Depends(require_role(UserRole.ADMIN)),
) -> dict:
    """ユーザーの有効/無効切替（管理者のみ）"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = not user.is_active
    await db.flush()
    return {"success": True, "user_id": user_id, "is_active": user.is_active}


class PasswordResetRequest(BaseModel):
    new_password: str


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    body: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenData = Depends(require_role(UserRole.ADMIN)),
) -> dict:
    """ユーザーのパスワードリセット（管理者のみ）"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.hashed_password = hash_password(body.new_password)
    await db.flush()
    return {"success": True, "user_id": user_id}
