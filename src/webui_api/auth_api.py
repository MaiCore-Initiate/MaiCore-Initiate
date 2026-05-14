# -*- coding: utf-8 -*-
"""账号系统真实接口。"""
from __future__ import annotations

import html
import json
import logging
import secrets
import urllib.parse
import urllib.request
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from src.core.p_config import p_config_manager

from .auth_core import (
    ACTION_ORDER,
    PAGE_ORDER,
    account_store,
    github_oauth_state_store,
    get_request_user,
    require_action,
    require_admin,
    request_rate_limiter,
    resolve_request_auth,
    session_manager,
)

router = APIRouter()

SESSION_COOKIE_NAME = "webui_session"
SESSION_MAX_AGE = 7 * 24 * 60 * 60


def _ensure_session_id(request: Request) -> str:
    session_id = request.cookies.get(SESSION_COOKIE_NAME, "").strip()
    return session_id or secrets.token_hex(16)


def _should_use_secure_cookie(request: Request) -> bool:
    if request.url.scheme == "https":
        return True
    forwarded_proto = request.headers.get("x-forwarded-proto", "").lower()
    return forwarded_proto == "https"


def _set_session_cookie(response: Response, request: Request, session_id: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session_id,
        max_age=SESSION_MAX_AGE,
        path="/",
        httponly=True,
        secure=_should_use_secure_cookie(request),
        samesite="strict",
    )


def _clear_session_cookie(response: Response, request: Request) -> None:
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        secure=_should_use_secure_cookie(request),
        samesite="strict",
    )


def _enforce_rate_limit(key: str, limit: int, window_seconds: int) -> None:
    retry_after = request_rate_limiter.check(key, limit=limit, window_seconds=window_seconds)
    if retry_after > 0:
        from fastapi import HTTPException
        raise HTTPException(status_code=429, detail=f"请求过于频繁，请在 {retry_after} 秒后重试")


GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"
GITHUB_EMAILS_URL = "https://api.github.com/user/emails"
GITHUB_DEFAULT_SCOPE = "read:user user:email"
GITHUB_DEFAULT_CLIENT_ID = "Ov23liLTqa4d2ihNDRBK"


def _github_config() -> Dict[str, Any]:
    if hasattr(p_config_manager, "reload_if_changed"):
        p_config_manager.reload_if_changed()
    config = p_config_manager.get("webui.github_oauth", {}) or {}
    return config if isinstance(config, dict) else {}


def _github_scope(config: Dict[str, Any]) -> str:
    scope = str(config.get("scope", "") or "").strip()
    if not scope or scope == "read:user user:email":
        return GITHUB_DEFAULT_SCOPE
    return scope


def _github_client_id(config: Dict[str, Any]) -> str:
    return str(config.get("client_id") or "").strip() or GITHUB_DEFAULT_CLIENT_ID


def _github_enabled(config: Dict[str, Any]) -> bool:
    explicit_client_id = str(config.get("client_id") or "").strip()
    if not explicit_client_id:
        return True
    return bool(config.get("enabled", False))


def _github_status_payload() -> Dict[str, Any]:
    config = _github_config()
    return {
        "success": True,
        "configured": True,
        "enabled": _github_enabled(config),
        "scope": _github_scope(config),
        "missing_fields": [],
    }


def _get_proxy_opener():
    import os
    http_proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy") or os.environ.get("HTTP_PROXY") or os.environ.get("http_proxy")
    if http_proxy:
        return urllib.request.ProxyHandler({"http": http_proxy, "https": http_proxy})
    return None


def _request_device_code(client_id: str, scope: str) -> Dict[str, Any]:
    data = {
        "client_id": client_id,
        "scope": scope,
    }
    body = urllib.parse.urlencode(data).encode("utf-8")
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "MaiCore-Start-WebUI",
    }
    req = urllib.request.Request(GITHUB_DEVICE_CODE_URL, data=body, headers=headers, method="POST")
    proxy_handler = _get_proxy_opener()
    if proxy_handler:
        opener = urllib.request.build_opener(proxy_handler)
        with opener.open(req, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def _poll_access_token(client_id: str, device_code: str) -> Dict[str, Any]:
    data = {
        "client_id": client_id,
        "device_code": device_code,
        "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
    }
    body = urllib.parse.urlencode(data).encode("utf-8")
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "MaiCore-Start-WebUI",
    }
    req = urllib.request.Request(GITHUB_TOKEN_URL, data=body, headers=headers, method="POST")
    proxy_handler = _get_proxy_opener()
    if proxy_handler:
        opener = urllib.request.build_opener(proxy_handler)
        with opener.open(req, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def _request_json(url: str, data: Dict[str, str] | None = None, access_token: str = "") -> Any:
    body = None
    headers = {"Accept": "application/json", "User-Agent": "MaiCore-Start-WebUI"}
    if data is not None:
        body = urllib.parse.urlencode(data).encode("utf-8")
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
        headers["Accept"] = "application/vnd.github+json"
        headers["X-GitHub-Api-Version"] = "2022-11-28"
    req = urllib.request.Request(url, data=body, headers=headers, method="POST" if data is not None else "GET")
    proxy_handler = _get_proxy_opener()
    try:
        if proxy_handler:
            opener = urllib.request.build_opener(proxy_handler)
            with opener.open(req, timeout=30) as response:
                raw = response.read().decode("utf-8")
        else:
            with urllib.request.urlopen(req, timeout=30) as response:
                raw = response.read().decode("utf-8")
    except Exception as exc:
        logger.warning("HTTP request failed: %s", exc)
        raise
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        parsed = urllib.parse.parse_qs(raw, keep_blank_values=True)
        return {k: v[0] if len(v) == 1 else v for k, v in parsed.items()}


def _github_api_json(url: str, access_token: str) -> Any:
    return _request_json(url, access_token=access_token)


def _select_github_email(github_user: Dict[str, Any], github_emails: Any) -> tuple[str, bool]:
    if isinstance(github_emails, list):
        verified = [item for item in github_emails if isinstance(item, dict) and item.get("verified") and item.get("email")]
        primary = next((item for item in verified if item.get("primary")), None)
        selected = primary or (verified[0] if verified else None)
        if selected:
            return str(selected.get("email") or "").strip(), True
    email = str(github_user.get("email") or "").strip()
    return email, bool(email)


def _github_callback_html(success: bool, message: str) -> str:
    status = "success" if success else "error"
    safe_status = html.escape(status)
    safe_message = html.escape(message)
    heading = "GitHub 登录成功" if success else "GitHub 登录失败"
    closing_text = "正在关闭窗口..." if success else "正在返回..."
    return f"""<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>GitHub OAuth</title></head>
<body style="font-family: system-ui, sans-serif; padding: 32px;">
<h1>{heading}</h1>
<p>{safe_message}</p>
<p id="closing" style="color: #888;"></p>
<script>
  (function () {{
    var payload = {{type: 'mcstart-github-oauth', status: '{safe_status}', message: '{safe_message}'}};
    try {{ localStorage.setItem('mcstart.github-oauth-result', JSON.stringify(payload)); }} catch (ignore) {{}}
    var isPopup = false;
    try {{ isPopup = !!window.opener && !window.opener.closed; }} catch (ignore) {{}}
    if (isPopup) {{
      try {{ window.opener.postMessage(payload, window.location.origin); }} catch (ignore) {{}}
      document.getElementById('closing').textContent = '{closing_text}';
      window.setTimeout(function () {{ window.close(); }}, 800);
    }} else {{
      document.getElementById('closing').textContent = '即将跳转...';
      window.setTimeout(function () {{ window.location.href = '/'; }}, 1500);
    }}
  }})();
</script>
</body>
</html>"""


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


class CloseAccountBody(BaseModel):
    password: str = ""
    code: str = ""
    confirm_email: str = ""


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


class GithubReplaceAdminBody(BaseModel):
    confirm: bool = False
    token: str = ""


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


@router.get("/github/status")
async def get_github_oauth_status():
    return _github_status_payload()


@router.post("/github/start")
async def start_github_oauth(request: Request):
    client_host = request.client.host if request.client else "unknown"
    _enforce_rate_limit(f"github-oauth-start:{client_host}", limit=10, window_seconds=300)
    config = _github_config()
    status = _github_status_payload()
    if not status["enabled"]:
        return {**status, "success": False, "message": "GitHub Device Flow 未启用。"}
    if not status["configured"]:
        return {
            **status,
            "success": False,
            "message": "GitHub Device Flow 配置不完整，缺少 client_id。",
        }

    client_id = _github_client_id(config)
    scope = status["scope"]
    try:
        device_response = _request_device_code(client_id, scope)
    except Exception as exc:
        logger.exception("GitHub device code request failed: %s", exc)
        return {
            **status,
            "success": False,
            "message": f"GitHub Device Flow 启动失败：{exc}",
        }

    device_code = device_response.get("device_code")
    user_code = device_response.get("user_code")
    verification_uri = device_response.get("verification_uri", "https://github.com/login/device")
    verification_uri_complete = device_response.get("verification_uri_complete")
    if not verification_uri_complete:
        verification_uri_complete = f"{verification_uri}?user_code={user_code}"
    interval = int(device_response.get("interval", 5))
    expires_in = int(device_response.get("expires_in", 900))

    record = github_oauth_state_store.create({
        "device_code": device_code,
        "user_code": user_code,
        "client_host": client_host,
    })

    return {
        "success": True,
        "authorization_url": verification_uri_complete,
        "device_code": device_code,
        "user_code": user_code,
        "verification_uri": verification_uri,
        "verification_uri_complete": verification_uri_complete,
        "interval": interval,
        "expires_in": expires_in,
        "state": record["state"],
    }


@router.post("/github/poll")
async def poll_github_oauth(request: Request, response: Response):
    try:
        body = await request.json()
    except Exception:
        body = {}

    state = body.get("state", "")
    device_code = body.get("device_code", "")

    logger.info(f"GitHub poll: state={state[:30] if state else 'empty'}, device_code={device_code[:30] if device_code else 'empty'}")

    if not state and not device_code:
        logger.warning("GitHub poll: no state or device_code provided")
        return {"success": False, "message": "请先发起 GitHub Device Flow 授权。"}

    config = _github_config()
    status = _github_status_payload()
    if not status["enabled"] or not status["configured"]:
        return {**status, "success": False, "message": "GitHub Device Flow 未启用或配置不完整。"}

    record = None
    if state:
        record = github_oauth_state_store.get(state)
        logger.info(f"GitHub poll: state record found: {record is not None}")
        if record:
            device_code = record.get("device_code", device_code)

    if not device_code:
        logger.warning("GitHub poll: no device_code available")
        return {"success": False, "message": "授权状态已过期，请重新发起。"}

    logger.info(f"GitHub poll: attempting to exchange token for device_code={device_code[:20]}...")

    client_id = _github_client_id(config)
    try:
        token_response = _poll_access_token(client_id, device_code)
    except Exception as exc:
        logger.warning("GitHub device poll network error (will retry): %s", exc)
        return {"success": True, "status": "pending", "message": "等待授权中..."}

    error = token_response.get("error")
    if error:
        if error == "authorization_pending":
            return {"success": True, "status": "pending", "message": "等待用户授权..."}
        elif error == "slowdown":
            wait = int(token_response.get("interval", 5))
            return {"success": True, "status": "pending", "message": f"请求过于频繁，请等待 {wait} 秒。"}
        elif error == "expired_token":
            return {"success": False, "message": "授权已过期，请重新发起。"}
        elif error == "access_denied":
            return {"success": False, "message": "用户拒绝授权。"}
        else:
            return {"success": False, "message": f"授权出错：{error}"}

    access_token = str(token_response.get("access_token") or "").strip()
    if not access_token:
        logger.warning("GitHub poll: no access_token in response")
        return {"success": False, "message": "未能获取访问令牌。"}

    logger.info("GitHub poll: successfully got access_token, fetching user info...")

    try:
        github_user = _github_api_json(GITHUB_USER_URL, access_token)
        github_emails = _github_api_json(GITHUB_EMAILS_URL, access_token)
    except Exception as exc:
        logger.exception("GitHub API request failed: %s", exc)
        return {"success": False, "message": f"GitHub API 请求失败：{exc}"}

    primary_email, email_verified = _select_github_email(github_user, github_emails)
    result = account_store.upsert_github_user(github_user, primary_email, email_verified)
    if not result.get("success"):
        return {**result, "message": result.get("message", "GitHub 登录失败。")}

    incoming_session_id = _ensure_session_id(request)
    login_result = session_manager.login_oauth(incoming_session_id, result["user"]["id"])
    if not login_result.get("success"):
        return {**login_result, "message": login_result.get("message", "GitHub 登录失败。")}

    session_id = secrets.token_hex(16)
    session_manager.rotate_session(incoming_session_id, session_id)
    _set_session_cookie(response, request, session_id)

    if state:
        github_oauth_state_store.consume(state)

    return {
        "success": True,
        "status": "completed",
        "session_id": session_id,
        "user": login_result.get("user"),
        "created": bool(result.get("created", False)),
    }


@router.get("/github/callback", response_class=HTMLResponse)
async def github_oauth_callback(request: Request):
    return HTMLResponse(
        _github_callback_html(False, "请在登录页面使用 Device Flow 进行授权。<br/>点击「通过 GitHub 登录」按钮，按提示在 GitHub 页面完成授权。"),
        status_code=400,
    )


@router.post("/github/replace-admin")
async def replace_admin_with_github_user(body: GithubReplaceAdminBody, request: Request, response: Response, user: Dict[str, Any] = Depends(get_request_user)):
    result = account_store.replace_admin_with_github_user(user["id"], body.confirm, body.token)
    if result.get("success"):
        incoming_session_id = _ensure_session_id(request)
        session_id = secrets.token_hex(16)
        session_manager.rotate_session(incoming_session_id, session_id)
        _set_session_cookie(response, request, session_id)
        result["session_id"] = session_id
    return result


@router.post("/send-login-code")
async def send_login_code(body: IdentifierBody, request: Request):
    client_host = request.client.host if request.client else "unknown"
    identifier = (body.identifier or "").strip().lower()
    _enforce_rate_limit(f"send-login-code:{client_host}:{identifier}", limit=3, window_seconds=60)
    return account_store.send_login_code(body.identifier)


@router.post("/send-register-code")
async def send_register_code(body: EmailBody, request: Request):
    client_host = request.client.host if request.client else "unknown"
    email = (body.email or "").strip().lower()
    _enforce_rate_limit(f"send-register-code:{client_host}:{email}", limit=5, window_seconds=600)
    return account_store.send_register_code(body.email)


@router.post("/send-sensitive-code")
async def send_sensitive_code(
    body: SensitiveCodeBody,
    request: Request,
    user: Dict[str, Any] = Depends(get_request_user),
):
    client_host = request.client.host if request.client else "unknown"
    _enforce_rate_limit(f"send-sensitive-code:{client_host}:{user['id']}:{body.purpose}", limit=5, window_seconds=600)
    return account_store.send_sensitive_code(user["id"], body.purpose)


@router.post("/login")
async def account_login(body: AccountLoginBody, request: Request, response: Response):
    incoming_session_id = _ensure_session_id(request)
    client_host = request.client.host if request.client else "unknown"
    identifier = (body.identifier or "token-login").strip().lower()
    _enforce_rate_limit(f"account-login:{client_host}:{identifier}", limit=10, window_seconds=300)
    if (body.token or "").strip():
        result = session_manager.login_with_token(incoming_session_id, body.token)
    else:
        result = session_manager.login_account(incoming_session_id, body.identifier, body.password, body.code)

    if result.get("success"):
        session_id = secrets.token_hex(16)
        session_manager.rotate_session(incoming_session_id, session_id)
        _set_session_cookie(response, request, session_id)
        result["session_id"] = session_id
    return result


@router.post("/register")
async def register_account(body: RegisterBody, request: Request):
    client_host = request.client.host if request.client else "unknown"
    _enforce_rate_limit(f"account-register:{client_host}:{(body.email or '').strip().lower()}", limit=5, window_seconds=900)
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


@router.post("/close-account")
async def close_account(
    body: CloseAccountBody,
    request: Request,
    response: Response,
    user: Dict[str, Any] = Depends(get_request_user),
):
    result = account_store.close_account(user["id"], body.model_dump())
    if result.get("success"):
        session_id = getattr(request.state, "session_id", None) or request.cookies.get(SESSION_COOKIE_NAME, "")
        if session_id:
            session_manager.logout(session_id)
        _clear_session_cookie(response, request)
    return result


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
