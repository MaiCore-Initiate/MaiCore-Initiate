# -*- coding: utf-8 -*-
"""账号系统真实接口。"""
from __future__ import annotations

import secrets
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field

from .auth_core import (
    ACTION_ORDER,
    PAGE_ORDER,
    account_store,
    get_request_user,
    require_action,
    require_admin,
    resolve_request_auth,
    session_manager,
)

router = APIRouter()

SESSION_COOKIE_NAME = "webui_session"
SESSION_MAX_AGE = 7 * 24 * 60 * 60


def _ensure_session_id(request: Request) -> str:
    session_id = request.cookies.get(SESSION_COOKIE_NAME, "").strip()
    return session_id or secrets.token_hex(16)


def _apply_session_cookie(response: Response, session_id: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session_id,
        max_age=SESSION_MAX_AGE,
        path="/",
        samesite="lax",
    )


class IdentifierBody(BaseModel):
    identifier: str = ""


class EmailBody(BaseModel):
    email: str = ""


class SensitiveCodeBody(BaseModel):
    purpose: str = ""


class AccountLoginBody(BaseModel):
    identifier: str = ""
    password: str = ""
    code: str = ""
    token: str = ""


class RegisterBody(BaseModel):
    name: str = ""
    email: str = ""
    password: str = ""
    code: str = ""
    avatar: str = ""
    reason: str = ""


class ProfileBody(BaseModel):
    name: str = ""
    avatar: str = ""


class PasswordBody(BaseModel):
    current_password: str = ""
    next_password: str = ""
    code: str = ""


class UpgradeBody(BaseModel):
    reason: str = ""


class RoleBody(BaseModel):
    role: str = ""


class PagePermissionBody(BaseModel):
    role: str = ""
    page: str = ""
    allowed: bool = False


class ActionPermissionBody(BaseModel):
    role: str = ""
    action: str = ""
    allowed: bool = False


class RegisterPolicyBody(BaseModel):
    whitelist_mode: bool | None = None
    allowed_domains: List[str] | None = None
    allow_guest_self_register: bool | None = None
    allow_guest_applications: bool | None = None
    allow_member_upgrade_applications: bool | None = None
    require_email_verification: bool | None = None


class AppearancePolicyBody(BaseModel):
    sync_admin_appearance: bool | None = None
    allow_custom_appearance: bool | None = None


class TransferAdminBody(BaseModel):
    target_user_id: str = ""
    token: str = ""
    code: str = ""


@router.get("/bootstrap")
async def get_account_bootstrap():
    return {"success": True, **account_store.get_bootstrap()}


@router.get("/state")
async def get_account_state(request: Request):
    user = resolve_request_auth(request)
    return {
        "success": True,
        "logged_in": user is not None,
        **account_store.get_state_snapshot(user.get("id") if user else None),
    }


@router.post("/send-login-code")
async def send_login_code(body: IdentifierBody):
    return account_store.send_login_code(body.identifier)


@router.post("/send-register-code")
async def send_register_code(body: EmailBody):
    return account_store.send_register_code(body.email)


@router.post("/send-sensitive-code")
async def send_sensitive_code(
    body: SensitiveCodeBody,
    user: Dict[str, Any] = Depends(get_request_user),
):
    return account_store.send_sensitive_code(user["id"], body.purpose)


@router.post("/login")
async def account_login(body: AccountLoginBody, request: Request, response: Response):
    session_id = _ensure_session_id(request)
    if (body.token or "").strip():
        result = session_manager.login_with_token(session_id, body.token)
    else:
        result = session_manager.login_account(session_id, body.identifier, body.password, body.code)

    if result.get("success"):
        _apply_session_cookie(response, session_id)
        result["session_id"] = session_id
    return result


@router.post("/register")
async def register_account(body: RegisterBody):
    return account_store.register_account(body.model_dump())


@router.post("/profile")
async def update_profile(
    body: ProfileBody,
    user: Dict[str, Any] = Depends(get_request_user),
):
    return account_store.update_profile(user["id"], body.model_dump())


@router.post("/change-password")
async def change_password(
    body: PasswordBody,
    user: Dict[str, Any] = Depends(get_request_user),
):
    return account_store.change_password(user["id"], body.model_dump())


@router.post("/request-upgrade")
async def request_upgrade(
    body: UpgradeBody,
    user: Dict[str, Any] = Depends(require_action("member.upgrade.request")),
):
    return account_store.request_member_upgrade(user["id"], body.reason)


@router.post("/requests/{request_id}/approve")
async def approve_request(
    request_id: str,
    admin: Dict[str, Any] = Depends(require_admin),
):
    return account_store.approve_request(admin["id"], request_id)


@router.post("/requests/{request_id}/reject")
async def reject_request(
    request_id: str,
    admin: Dict[str, Any] = Depends(require_admin),
):
    return account_store.reject_request(admin["id"], request_id)


@router.post("/users/{user_id}/role")
async def set_user_role(
    user_id: str,
    body: RoleBody,
    admin: Dict[str, Any] = Depends(require_admin),
):
    return account_store.set_user_role(admin["id"], user_id, body.role)


@router.post("/permissions/page")
async def set_page_permission(
    body: PagePermissionBody,
    admin: Dict[str, Any] = Depends(require_admin),
):
    if body.page not in PAGE_ORDER:
        return {"success": False, "message": "页面权限参数无效。"}
    return account_store.set_role_page_permission(admin["id"], body.role, body.page, body.allowed)


@router.post("/permissions/action")
async def set_action_permission(
    body: ActionPermissionBody,
    admin: Dict[str, Any] = Depends(require_admin),
):
    if body.action not in ACTION_ORDER:
        return {"success": False, "message": "操作权限参数无效。"}
    return account_store.set_role_action_permission(admin["id"], body.role, body.action, body.allowed)


@router.post("/policies/register")
async def update_register_policy(
    body: RegisterPolicyBody,
    admin: Dict[str, Any] = Depends(require_admin),
):
    patch = {key: value for key, value in body.model_dump().items() if value is not None}
    return account_store.update_register_policy(admin["id"], patch)


@router.post("/policies/appearance")
async def update_appearance_policy(
    body: AppearancePolicyBody,
    admin: Dict[str, Any] = Depends(require_admin),
):
    patch = {key: value for key, value in body.model_dump().items() if value is not None}
    return account_store.update_appearance_policy(admin["id"], patch)


@router.post("/transfer-admin")
async def transfer_admin(
    body: TransferAdminBody,
    admin: Dict[str, Any] = Depends(require_admin),
):
    return account_store.transfer_admin(admin["id"], body.target_user_id, body.token, body.code)
