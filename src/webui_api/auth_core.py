# -*- coding: utf-8 -*-
"""账号系统与会话鉴权核心。"""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import secrets
import threading
import time
from copy import deepcopy
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
ACCOUNT_DATA_FILE = PROJECT_ROOT / "data" / "account_system.json"
P_CONFIG_PATH = PROJECT_ROOT / "config" / "P-config.toml"

LOGIN_FAIL_LIMIT = 5
CODE_TTL_SECONDS = 5 * 60
SESSION_TTL_SECONDS = 7 * 24 * 60 * 60
GITHUB_OAUTH_STATE_TTL_SECONDS = 10 * 60

PAGE_ORDER = [
    "home",
    "instances",
    "config",
    "knowledge",
    "db-migration",
    "plugins",
    "deploy",
    "status",
    "logs",
    "misc",
    "settings",
    "component-download",
]

ACTION_ORDER = [
    "instances.control",
    "deploy.manage",
    "knowledge.manage",
    "components.manage",
    "multi-instance.manage",
    "ports.manage",
    "settings.system",
    "settings.security",
    "accounts.manage",
    "appearance.customize",
    "quick-access.customize",
    "member.upgrade.request",
    "misc.about.access",
    "misc.author.access",
    "misc.tech.access",
    "misc.libs.access",
    "misc.license.access",
    "misc.components.access",
    "misc.webshell.access",
    "misc.screensaver.access",
    "misc.desktop-pet.access",
    "misc.custom-console.access",
    "misc.template-market.access",
]

DEFAULT_EMAIL_WHITELIST = [
    "qq.com",
    "gmail.com",
    "outlook.com",
    "hotmail.com",
    "live.com",
    "icloud.com",
    "me.com",
    "163.com",
    "126.com",
    "yeah.net",
    "foxmail.com",
    "sina.com",
    "aliyun.com",
    "yahoo.com",
    "proton.me",
    "protonmail.com",
]


def now_iso() -> str:
    return datetime.now().isoformat()


def normalize(value: str) -> str:
    return (value or "").strip().lower()


def safe_copy(value: Any) -> Any:
    return deepcopy(value)


def make_id(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(6)}"


def generate_code_verifier() -> str:
    return secrets.token_urlsafe(64)


def make_s256_code_challenge(code_verifier: str) -> str:
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def make_oauth_state() -> str:
    return secrets.token_urlsafe(32)


def generate_local_password() -> str:
    return f"Gh{secrets.token_urlsafe(30)}9"


def is_valid_email(email: str) -> bool:
    email = (email or "").strip()
    return "@" in email and "." in email.split("@")[-1]


def is_strong_password(password: str) -> bool:
    return len(password or "") >= 8 and any(ch.isalpha() for ch in password) and any(ch.isdigit() for ch in password)


def _empty_page_permissions() -> Dict[str, bool]:
    return {page: False for page in PAGE_ORDER}


def _empty_action_permissions() -> Dict[str, bool]:
    return {action: False for action in ACTION_ORDER}


def _default_role_templates() -> Dict[str, Dict[str, Dict[str, bool]]]:
    member_pages = _empty_page_permissions()
    for page in ["home", "instances", "config", "knowledge", "plugins", "deploy", "status", "logs", "misc", "settings", "component-download"]:
        member_pages[page] = True

    guest_pages = _empty_page_permissions()
    for page in ["home", "status", "logs", "misc", "settings", "component-download"]:
        guest_pages[page] = True

    member_actions = _empty_action_permissions()
    member_actions["instances.control"] = True
    member_actions["deploy.manage"] = True
    member_actions["knowledge.manage"] = True
    member_actions["multi-instance.manage"] = True
    member_actions["ports.manage"] = True
    member_actions["appearance.customize"] = True
    member_actions["quick-access.customize"] = True
    member_actions["misc.about.access"] = True
    member_actions["misc.author.access"] = True
    member_actions["misc.tech.access"] = True
    member_actions["misc.libs.access"] = True
    member_actions["misc.license.access"] = True
    member_actions["misc.components.access"] = True
    member_actions["misc.screensaver.access"] = True
    member_actions["misc.desktop-pet.access"] = True
    member_actions["misc.custom-console.access"] = True
    member_actions["misc.template-market.access"] = True

    guest_actions = _empty_action_permissions()
    guest_actions["appearance.customize"] = True
    guest_actions["quick-access.customize"] = True
    guest_actions["member.upgrade.request"] = True
    guest_actions["misc.about.access"] = True
    guest_actions["misc.author.access"] = True
    guest_actions["misc.tech.access"] = True
    guest_actions["misc.libs.access"] = True
    guest_actions["misc.license.access"] = True
    guest_actions["misc.components.access"] = True
    guest_actions["misc.screensaver.access"] = True
    guest_actions["misc.desktop-pet.access"] = True
    guest_actions["misc.custom-console.access"] = True
    guest_actions["misc.template-market.access"] = True

    return {
        "member": {"pages": member_pages, "actions": member_actions},
        "guest": {"pages": guest_pages, "actions": guest_actions},
    }


class TokenManager:
    """统一读取和更新系统 Token。"""

    def __init__(self, config_path: Path):
        self.config_path = config_path
        self._ensure_token()

    def _load_config(self) -> dict:
        try:
            if self.config_path.exists():
                import toml as toml_lib
                with open(self.config_path, "r", encoding="utf-8") as handle:
                    return toml_lib.load(handle)
        except Exception as exc:
            logger.error("读取配置文件失败: %s", exc)
        return {}

    def _save_config(self, config: dict):
        try:
            import toml as toml_lib
            self.config_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.config_path, "w", encoding="utf-8") as handle:
                toml_lib.dump(config, handle)
        except Exception as exc:
            logger.error("保存配置文件失败: %s", exc)

    def _ensure_token(self):
        config = self._load_config()
        token = config.get("webui", {}).get("webui_token", "")
        if token:
            return
        token = secrets.token_hex(16)
        config.setdefault("webui", {})["webui_token"] = token
        self._save_config(config)
        logger.info("已生成新的WebUI Token")

    def get_token(self) -> str:
        return self._load_config().get("webui", {}).get("webui_token", "")

    def verify_token(self, input_token: str) -> bool:
        return (input_token or "") == self.get_token()

    def set_token(self, token: str) -> bool:
        token = (token or "").strip()
        if not token:
            return False
        config = self._load_config()
        config.setdefault("webui", {})["webui_token"] = token
        self._save_config(config)
        return True


class OAuthStateStore:
    """短期保存 OAuth state 与 PKCE verifier。"""

    def __init__(self, ttl_seconds: int = GITHUB_OAUTH_STATE_TTL_SECONDS):
        self.ttl_seconds = ttl_seconds
        self._lock = threading.Lock()
        self._states: Dict[str, Dict[str, Any]] = {}

    def _prune(self) -> None:
        now_ts = time.time()
        self._states = {
            state: record
            for state, record in self._states.items()
            if float(record.get("expires_at", 0)) > now_ts
        }

    def create(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        state = make_oauth_state()
        now_ts = time.time()
        record = {
            **payload,
            "state": state,
            "created_at": now_ts,
            "expires_at": now_ts + self.ttl_seconds,
        }
        with self._lock:
            self._prune()
            self._states[state] = record
        return safe_copy(record)

    def get(self, state: str) -> Dict[str, Any] | None:
        with self._lock:
            self._prune()
            record = self._states.get(state)
            if record and float(record.get("expires_at", 0)) > time.time():
                return safe_copy(record)
            return None

    def consume(self, state: str) -> Optional[Dict[str, Any]]:
        state = (state or "").strip()
        if not state:
            return None
        with self._lock:
            self._prune()
            record = self._states.pop(state, None)
        return safe_copy(record) if record else None


class AccountStore:
    """账号数据持久化。"""

    def __init__(self, data_path: Path, token_mgr: TokenManager):
        self.data_path = data_path
        self.token_manager = token_mgr
        self._lock = threading.RLock()
        self._ensure_data()

    def _default_state(self) -> Dict[str, Any]:
        return {
            "users": [
                {
                    "id": "system-admin",
                    "role": "admin",
                    "status": "active",
                    "name": "系统管理员",
                    "email": "admin@maicore.local",
                    "avatar": "",
                    "password": "",
                    "created_at": now_iso(),
                    "joined_via": "seed",
                    "last_login_at": None,
                    "login_code_enabled": False,
                }
            ],
            "register_policy": {
                "whitelist_mode": True,
                "allowed_domains": list(DEFAULT_EMAIL_WHITELIST),
                "allow_guest_self_register": True,
                "allow_guest_applications": True,
                "allow_member_upgrade_applications": True,
                "require_email_verification": True,
            },
            "appearance_policy": {
                "sync_admin_appearance": True,
                "allow_custom_appearance": False,
            },
            "role_templates": _default_role_templates(),
            "verification_codes": {},
            "requests": [],
            "audit_trail": [],
        }

    def _ensure_data(self):
        self.data_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.data_path.exists():
            self._save_state(self._default_state())
            return
        try:
            self._save_state(self._normalize_state(self._load_state()))
        except Exception:
            logger.exception("账号数据初始化失败，已重建默认状态")
            self._save_state(self._default_state())

    def _load_state(self) -> Dict[str, Any]:
        if not self.data_path.exists():
            return self._default_state()
        with open(self.data_path, "r", encoding="utf-8") as handle:
            return json.load(handle)

    def _save_state(self, state: Dict[str, Any]):
        with open(self.data_path, "w", encoding="utf-8") as handle:
            json.dump(state, handle, ensure_ascii=False, indent=2)

    def _normalize_state(self, raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        defaults = self._default_state()
        state = safe_copy(defaults)
        raw = raw or {}

        users = raw.get("users") if isinstance(raw.get("users"), list) else defaults["users"]
        state["users"] = users or defaults["users"]
        for user in state["users"]:
            if user.get("joined_via") == "github-oauth":
                user["joined_via"] = "github"
            if "password_generated" not in user:
                user["password_generated"] = bool(user.get("joined_via") == "github" and user.get("github_id") and user.get("password"))
            else:
                user["password_generated"] = bool(user.get("password_generated", False))
            user["github_admin_transfer_decided"] = bool(user.get("github_admin_transfer_decided", False))
            user["github_admin_transfer_pending"] = bool(user.get("github_admin_transfer_pending", False))
        if not any(user.get("role") == "admin" for user in state["users"]):
            state["users"].append(defaults["users"][0])
        for user in state["users"]:
            self._sync_github_admin_transfer_candidate(state, user)

        role_templates = raw.get("role_templates") if isinstance(raw.get("role_templates"), dict) else {}
        for role in ("member", "guest"):
            state["role_templates"][role]["pages"].update(role_templates.get(role, {}).get("pages", {}))
            state["role_templates"][role]["actions"].update(role_templates.get(role, {}).get("actions", {}))

        state["register_policy"].update(raw.get("register_policy", {}))
        allowed_domains = state["register_policy"].get("allowed_domains") or []
        state["register_policy"]["allowed_domains"] = [normalize(item) for item in allowed_domains if item]

        state["appearance_policy"].update(raw.get("appearance_policy", {}))
        state["verification_codes"] = raw.get("verification_codes", {})
        state["requests"] = raw.get("requests", []) if isinstance(raw.get("requests"), list) else []
        state["audit_trail"] = raw.get("audit_trail", []) if isinstance(raw.get("audit_trail"), list) else []
        self._prune_codes(state)
        return state

    def _prune_codes(self, state: Dict[str, Any]):
        now_ts = datetime.now().timestamp()
        state["verification_codes"] = {
            key: value
            for key, value in state.get("verification_codes", {}).items()
            if float(value.get("expires_at", 0)) > now_ts
        }

    def _mutate(self, mutator):
        with self._lock:
            state = self._normalize_state(self._load_state())
            result = mutator(state)
            self._save_state(state)
            return result

    def _read(self) -> Dict[str, Any]:
        with self._lock:
            return self._normalize_state(self._load_state())

    def _find_user(self, state: Dict[str, Any], user_id: str) -> Optional[Dict[str, Any]]:
        for user in state["users"]:
            if user.get("id") == user_id:
                return user
        return None

    def _find_user_by_identifier(self, state: Dict[str, Any], identifier: str) -> Optional[Dict[str, Any]]:
        needle = normalize(identifier)
        for user in state["users"]:
            if normalize(user.get("email", "")) == needle or normalize(user.get("name", "")) == needle:
                return user
        return None

    def _find_user_by_github_id(self, state: Dict[str, Any], github_id: str) -> Optional[Dict[str, Any]]:
        needle = str(github_id or "").strip()
        if not needle:
            return None
        for user in state["users"]:
            if str(user.get("github_id", "")).strip() == needle:
                return user
        return None

    def _find_user_by_email(self, state: Dict[str, Any], email: str) -> Optional[Dict[str, Any]]:
        needle = normalize(email)
        if not needle:
            return None
        for user in state["users"]:
            if normalize(user.get("email", "")) == needle:
                return user
        return None

    def _remove_user_records(self, state: Dict[str, Any], user_id: str) -> None:
        state["users"] = [item for item in state["users"] if item.get("id") != user_id]
        state["requests"] = [
            item for item in state.get("requests", [])
            if item.get("applicant_id") != user_id
        ]
        state["verification_codes"] = {
            key: value for key, value in state.get("verification_codes", {}).items()
            if not key.startswith(f"login:{user_id}") and not key.startswith(f"sensitive:{user_id}:")
        }

    def _public_user(self, user: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not user:
            return None
        joined_via = user.get("joined_via")
        if joined_via == "github-oauth":
            joined_via = "github"
        public_user = {
            "id": user.get("id"),
            "role": user.get("role"),
            "status": user.get("status"),
            "name": user.get("name"),
            "email": user.get("email"),
            "avatar": user.get("avatar") or "",
            "created_at": user.get("created_at"),
            "joined_via": joined_via,
            "last_login_at": user.get("last_login_at"),
            "login_code_enabled": bool(user.get("login_code_enabled", False)),
            "github_admin_transfer_pending": bool(user.get("github_admin_transfer_pending", False)),
            "password_configured": bool(user.get("password")) and not bool(user.get("password_generated", False)),
            "password_managed_by_github": bool(user.get("github_id")) and bool(user.get("password_generated", False)),
        }
        if user.get("github_id"):
            public_user["github"] = {
                "id": user.get("github_id"),
                "login": user.get("github_login"),
                "url": user.get("github_url") or "",
                "email_verified": bool(user.get("github_email_verified", False)),
            }
        return public_user

    def _record_audit(self, state: Dict[str, Any], action: str, detail: str):
        trail = state.get("audit_trail", [])
        trail.insert(0, {
            "id": make_id("audit"),
            "action": action,
            "detail": detail,
            "at": now_iso(),
        })
        state["audit_trail"] = trail[:80]

    def get_admin_user(self) -> Dict[str, Any]:
        state = self._read()
        for user in state["users"]:
            if user.get("role") == "admin":
                return user
        return state["users"][0]

    def get_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        return self._find_user(self._read(), user_id)

    def can_action(self, user: Optional[Dict[str, Any]], action: str) -> bool:
        if not user or user.get("status") != "active":
            return False
        if user.get("role") == "admin":
            return True
        state = self._read()
        return bool(state["role_templates"].get(user.get("role"), {}).get("actions", {}).get(action, False))

    def can_page(self, user: Optional[Dict[str, Any]], page: str) -> bool:
        if not user or user.get("status") != "active":
            return False
        if user.get("role") == "admin":
            return True
        state = self._read()
        return bool(state["role_templates"].get(user.get("role"), {}).get("pages", {}).get(page, False))

    def get_bootstrap(self) -> Dict[str, Any]:
        state = self._read()
        admin = self.get_admin_user()
        return {
            "current_admin": self._public_user(admin),
            "register_policy": safe_copy(state["register_policy"]),
            "appearance_policy": safe_copy(state["appearance_policy"]),
            "admin_token_configured": bool(self.token_manager.get_token()),
        }

    def get_state_snapshot(self, current_user_id: Optional[str]) -> Dict[str, Any]:
        state = self._read()
        current_user = self._find_user(state, current_user_id) if current_user_id else None
        return {
            "current_user": self._public_user(current_user),
            "current_admin": self._public_user(self.get_admin_user()),
            "users": [self._public_user(user) for user in state["users"]],
            "requests": safe_copy(state["requests"]),
            "register_policy": safe_copy(state["register_policy"]),
            "appearance_policy": safe_copy(state["appearance_policy"]),
            "role_templates": safe_copy(state["role_templates"]),
            "audit_trail": safe_copy(state["audit_trail"]),
            "admin_token_configured": bool(self.token_manager.get_token()),
        }

    def issue_code(self, key: str, purpose: str) -> Dict[str, Any]:
        code = f"{secrets.randbelow(900000) + 100000}"

        def mutator(state: Dict[str, Any]):
            state["verification_codes"][key] = {
                "purpose": purpose,
                "code": code,
                "expires_at": (datetime.now() + timedelta(seconds=CODE_TTL_SECONDS)).timestamp(),
            }
            return code

        self._mutate(mutator)
        return {"success": True, "message": "验证码已生成。", "code": code}

    def _consume_code(self, state: Dict[str, Any], key: str, code: str) -> bool:
        self._prune_codes(state)
        record = state["verification_codes"].get(key)
        if not record or record.get("code") != (code or "").strip():
            return False
        state["verification_codes"].pop(key, None)
        return True

    def send_login_code(self, identifier: str) -> Dict[str, Any]:
        state = self._read()
        user = self._find_user_by_identifier(state, identifier)
        if not user or user.get("status") != "active":
            return {"success": False, "message": "未找到可登录的账号。"}
        if user.get("role") == "admin":
            return {"success": False, "message": "管理员请直接使用系统 Token 登录。"}
        return self.issue_code(f"login:{user['id']}", f"login:{user['email']}")

    def send_register_code(self, email: str) -> Dict[str, Any]:
        if not is_valid_email(email):
            return {"success": False, "message": "请输入正确的邮箱地址。"}
        return self.issue_code(f"register:{normalize(email)}", f"register:{email}")

    def send_sensitive_code(self, user_id: str, purpose: str) -> Dict[str, Any]:
        return self.issue_code(f"sensitive:{user_id}:{purpose}", f"sensitive:{purpose}")

    def verify_account_login(self, identifier: str, password: str, code: str) -> Dict[str, Any]:
        state = self._read()
        user = self._find_user_by_identifier(state, identifier)
        if not user or user.get("role") == "admin" or user.get("status") != "active":
            return {"success": False, "message": "账号不存在，或当前账号必须使用管理员 Token 登录。"}
        if user.get("password") != password:
            return {"success": False, "message": "密码错误。"}
        if user.get("login_code_enabled", False):
            if not self._consume_code(state, f"login:{user['id']}", code):
                return {"success": False, "message": "登录验证码无效，请重新发送。"}
        user["last_login_at"] = now_iso()
        self._record_audit(state, "account-login", f"{user['email']} 以 {user['role']} 身份登录")
        with self._lock:
            self._save_state(state)
        return {"success": True, "message": "登录成功。", "user": self._public_user(user)}

    def register_account(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        def mutator(state: Dict[str, Any]):
            name = (payload.get("name") or "").strip()
            email = (payload.get("email") or "").strip()
            password = payload.get("password") or ""
            reason = (payload.get("reason") or "").strip() or "申请创建访客账号"

            if not name:
                return {"success": False, "message": "请填写显示名称。"}
            if not is_valid_email(email):
                return {"success": False, "message": "请输入正确的邮箱地址。"}
            if not is_strong_password(password):
                return {"success": False, "message": "密码至少 8 位，且需包含字母和数字。"}
            if any(normalize(user.get("email", "")) == normalize(email) for user in state["users"]):
                return {"success": False, "message": "该邮箱已经被注册。"}

            policy = state["register_policy"]
            if policy.get("require_email_verification", True):
                if not self._consume_code(state, f"register:{normalize(email)}", payload.get("code") or ""):
                    return {"success": False, "message": "邮箱验证码错误或已过期。"}

            domain = normalize(email.split("@", 1)[1]) if "@" in email else ""
            domain_allowed = (not policy.get("whitelist_mode", True)) or (domain in policy.get("allowed_domains", []))
            can_direct = policy.get("allow_guest_self_register", True) and domain_allowed
            if (not can_direct) and (not policy.get("allow_guest_applications", True)):
                return {"success": False, "message": "当前系统不开放自助注册或申请，请联系管理员。"}

            new_user = {
                "id": make_id("user"),
                "role": "guest",
                "status": "active" if can_direct else "pending",
                "name": name,
                "email": email,
                "avatar": payload.get("avatar") or "",
                "password": password,
                "created_at": now_iso(),
                "joined_via": "self-register" if can_direct else "admin-approve",
                "last_login_at": None,
                "login_code_enabled": True,
            }
            state["users"].append(new_user)

            if not can_direct:
                state["requests"].insert(0, {
                    "id": make_id("request"),
                    "type": "guest-registration",
                    "applicant_id": new_user["id"],
                    "applicant_name": new_user["name"],
                    "applicant_email": new_user["email"],
                    "desired_role": "guest",
                    "reason": reason,
                    "created_at": now_iso(),
                    "status": "pending",
                })

            self._record_audit(
                state,
                "register-direct" if can_direct else "register-apply",
                f"{email} {'直接注册为访客' if can_direct else '提交访客注册申请'}",
            )
            return {
                "success": True,
                "message": "访客账号已创建，请返回登录。" if can_direct else "注册申请已提交，等待管理员审核。",
                "mode": "registered" if can_direct else "applied",
            }

        return self._mutate(mutator)

    def upsert_github_user(self, github_user: Dict[str, Any], primary_email: str, email_verified: bool) -> Dict[str, Any]:
        github_id = str(github_user.get("id") or "").strip()
        github_login = str(github_user.get("login") or "").strip()
        email = (primary_email or github_user.get("email") or "").strip()
        if not github_id or not github_login:
            return {"success": False, "message": "GitHub 用户信息不完整。"}
        if not is_valid_email(email):
            email = f"{github_login}@users.noreply.github.com"

        def mutator(state: Dict[str, Any]):
            non_admin_count_before = sum(1 for item in state["users"] if item.get("role") != "admin")
            user = self._find_user_by_github_id(state, github_id) or self._find_user_by_email(state, email)
            created = user is None
            if created:
                transfer_candidate = non_admin_count_before == 0
                user = {
                    "id": make_id("user"),
                    "role": "guest",
                    "status": "active",
                    "name": github_user.get("name") or github_login,
                    "email": email,
                    "avatar": github_user.get("avatar_url") or "",
                    "password": generate_local_password(),
                    "password_generated": True,
                    "created_at": now_iso(),
                    "joined_via": "github",
                    "last_login_at": None,
                    "login_code_enabled": False,
                    "github_admin_transfer_pending": transfer_candidate,
                    "github_admin_transfer_decided": False,
                }
                state["users"].append(user)
            else:
                user["status"] = "active"
                user["name"] = user.get("name") or github_user.get("name") or github_login
                user["email"] = user.get("email") or email
                user["avatar"] = github_user.get("avatar_url") or user.get("avatar") or ""
                if user.get("joined_via") in {"seed", "github-oauth"}:
                    user["joined_via"] = "github"
                if not user.get("password"):
                    user["password"] = generate_local_password()
                    user["password_generated"] = True
                elif "password_generated" not in user:
                    user["password_generated"] = bool(user.get("joined_via") == "github")
                user["github_admin_transfer_decided"] = bool(user.get("github_admin_transfer_decided", False))

            user["github_id"] = github_id
            user["github_login"] = github_login
            user["github_url"] = github_user.get("html_url") or ""
            user["github_email_verified"] = bool(email_verified)
            user["last_login_at"] = now_iso()
            self._sync_github_admin_transfer_candidate(state, user)
            self._record_audit(state, "github-oauth-login", f"{user['email']} 通过 GitHub OAuth 登录")
            return {
                "success": True,
                "message": "GitHub 登录成功。",
                "created": created,
                "user": self._public_user(user),
            }

        return self._mutate(mutator)

    def _is_github_admin_transfer_eligible(self, state: Dict[str, Any], user: Optional[Dict[str, Any]]) -> bool:
        if not user or user.get("role") == "admin" or user.get("status") != "active":
            return False
        if not user.get("github_id"):
            return False
        other_registered_users = [
            item for item in state["users"]
            if item.get("id") != user.get("id") and item.get("role") != "admin"
        ]
        return len(other_registered_users) == 0

    def _sync_github_admin_transfer_candidate(self, state: Dict[str, Any], user: Dict[str, Any]) -> None:
        if not user.get("github_id"):
            user["github_admin_transfer_pending"] = False
            return
        if user.get("github_admin_transfer_decided") or not self._is_github_admin_transfer_eligible(state, user):
            user["github_admin_transfer_pending"] = False
            return
        user["github_admin_transfer_pending"] = True

    def _is_github_admin_transfer_candidate(self, state: Dict[str, Any], user: Optional[Dict[str, Any]]) -> bool:
        if not user or user.get("github_admin_transfer_decided"):
            return False
        return self._is_github_admin_transfer_eligible(state, user) and bool(user.get("github_admin_transfer_pending"))

    def can_replace_admin_with_github_user(self, user_id: str) -> bool:
        state = self._read()
        user = self._find_user(state, user_id)
        return self._is_github_admin_transfer_candidate(state, user)

    def replace_admin_with_github_user(self, user_id: str, confirm: bool, token: str) -> Dict[str, Any]:
        if not confirm:
            def decline_mutator(state: Dict[str, Any]):
                target = self._find_user(state, user_id)
                if target and target.get("github_id"):
                    target["github_admin_transfer_pending"] = False
                    target["github_admin_transfer_decided"] = True
                    self._record_audit(state, "github-admin-transfer-decline", f"{target['email']} 暂不接收管理员权限")
                return {"success": True, "message": "已保留当前管理员。之后可以登录管理员账号，在 [设置]->[账号与成员管理] 中转让。"}

            return self._mutate(decline_mutator)

        def mutator(state: Dict[str, Any]):
            target = self._find_user(state, user_id)
            if not self._is_github_admin_transfer_candidate(state, target):
                return {"success": False, "message": "当前账号不满足 GitHub 管理员移交条件。"}
            if not self.token_manager.verify_token(token or ""):
                return {"success": False, "message": "系统 Token 校验失败。"}

            previous_admins = [user for user in state["users"] if user.get("role") == "admin" and user.get("id") != target.get("id")]
            for user in state["users"]:
                if user.get("id") == target.get("id"):
                    user["role"] = "admin"
                    user["status"] = "active"
                    user["github_admin_transfer_pending"] = False
                    user["github_admin_transfer_decided"] = True
                elif user.get("role") == "admin":
                    user["role"] = "member"
                    user["status"] = "active"
                    user["github_admin_transfer_pending"] = False
                else:
                    user["github_admin_transfer_pending"] = False
            if not any(user.get("role") == "admin" for user in state["users"]):
                target["role"] = "admin"
            self._record_audit(
                state,
                "github-admin-replace",
                f"GitHub 账号 {target['email']} 已接收管理员权限，原管理员数量 {len(previous_admins)}",
            )
            return {
                "success": True,
                "message": "管理员权限已移交至当前 GitHub 账号。",
                "current_admin": self._public_user(target),
            }

        return self._mutate(mutator)

    def update_profile(self, user_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        def mutator(state: Dict[str, Any]):
            user = self._find_user(state, user_id)
            if not user:
                return {"success": False, "message": "账号不存在。"}
            name = (payload.get("name") or "").strip()
            if not name:
                return {"success": False, "message": "显示名称不能为空。"}
            user["name"] = name
            user["avatar"] = payload.get("avatar") or ""
            self._record_audit(state, "profile-update", f"{user['email']} 更新了个人资料")
            return {"success": True, "message": "个人资料已更新。"}

        return self._mutate(mutator)

    def change_password(self, user_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        def mutator(state: Dict[str, Any]):
            user = self._find_user(state, user_id)
            if not user:
                return {"success": False, "message": "账号不存在。"}
            if user.get("role") == "admin":
                return {"success": False, "message": "管理员账号使用系统 Token 登录，不在这里修改密码。"}
            current_password = payload.get("current_password") or ""
            first_github_password_setup = bool(user.get("github_id")) and bool(user.get("password_generated")) and not current_password
            if not first_github_password_setup and user.get("password") != current_password:
                return {"success": False, "message": "当前密码不正确。"}
            next_password = payload.get("next_password") or ""
            if not is_strong_password(next_password):
                return {"success": False, "message": "新密码至少 8 位，且需包含字母和数字。"}
            if not self._consume_code(state, f"sensitive:{user_id}:password", payload.get("code") or ""):
                return {"success": False, "message": "安全验证码错误或已过期。"}
            user["password"] = next_password
            user["password_generated"] = False
            self._record_audit(state, "password-change", f"{user['email']} 修改了登录密码")
            return {"success": True, "message": "本地登录密码已设置。" if first_github_password_setup else "登录密码已更新。"}

        return self._mutate(mutator)

    def close_account(self, user_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        def mutator(state: Dict[str, Any]):
            user = self._find_user(state, user_id)
            if not user:
                return {"success": False, "message": "账号不存在。"}
            if user.get("role") == "admin":
                return {"success": False, "message": "管理员账号不能直接注销，请先在 [设置]->[账号与成员管理] 中转让管理员权限。"}
            confirm_email = normalize(payload.get("confirm_email") or "")
            if confirm_email != normalize(user.get("email", "")):
                return {"success": False, "message": "确认邮箱不匹配。"}
            password = payload.get("password") or ""
            password_optional = bool(user.get("github_id")) and bool(user.get("password_generated")) and not password
            if not password_optional and user.get("password") != password:
                return {"success": False, "message": "当前密码不正确。"}
            if not self._consume_code(state, f"sensitive:{user_id}:close-account", payload.get("code") or ""):
                return {"success": False, "message": "注销验证码错误或已过期。"}

            email = user.get("email", "")
            self._remove_user_records(state, user_id)
            self._record_audit(state, "account-close", f"{email} 注销了账号")
            return {"success": True, "message": "账号已注销。"}

        return self._mutate(mutator)

    def close_user_account(self, admin_id: str, user_id: str) -> Dict[str, Any]:
        def mutator(state: Dict[str, Any]):
            admin = self._find_user(state, admin_id)
            if not admin or admin.get("role") != "admin":
                return {"success": False, "message": "只有管理员可以注销其他账号。"}
            if admin_id == user_id:
                return {"success": False, "message": "管理员不能通过名册注销自己，请先转让管理员权限。"}
            user = self._find_user(state, user_id)
            if not user:
                return {"success": False, "message": "目标账号不存在。"}
            if user.get("role") == "admin":
                return {"success": False, "message": "管理员账号不能直接注销，请先转让管理员权限。"}

            email = user.get("email", "")
            admin_email = admin.get("email", "")
            self._remove_user_records(state, user_id)
            self._record_audit(state, "admin-account-close", f"{admin_email} 注销了账号 {email}")
            return {"success": True, "message": "目标账号已注销。"}

        return self._mutate(mutator)

    def request_member_upgrade(self, user_id: str, reason: str) -> Dict[str, Any]:
        def mutator(state: Dict[str, Any]):
            user = self._find_user(state, user_id)
            if not user:
                return {"success": False, "message": "账号不存在。"}
            if user.get("role") != "guest":
                return {"success": False, "message": "当前账号不是访客，无需申请升级。"}
            if not state["register_policy"].get("allow_member_upgrade_applications", True):
                return {"success": False, "message": "管理员已关闭成员升级申请。"}
            text = (reason or "").strip()
            if not text:
                return {"success": False, "message": "请填写申请理由。"}
            for request in state["requests"]:
                if request.get("type") == "member-upgrade" and request.get("applicant_id") == user_id and request.get("status") == "pending":
                    return {"success": False, "message": "你已经提交过升级申请，请等待管理员处理。"}
            state["requests"].insert(0, {
                "id": make_id("request"),
                "type": "member-upgrade",
                "applicant_id": user_id,
                "applicant_name": user["name"],
                "applicant_email": user["email"],
                "desired_role": "member",
                "reason": text,
                "created_at": now_iso(),
                "status": "pending",
            })
            self._record_audit(state, "member-upgrade-request", f"{user['email']} 提交了成员升级申请")
            return {"success": True, "message": "升级申请已提交。"}

        return self._mutate(mutator)

    def approve_request(self, admin_id: str, request_id: str) -> Dict[str, Any]:
        def mutator(state: Dict[str, Any]):
            admin = self._find_user(state, admin_id)
            if not admin or admin.get("role") != "admin":
                return {"success": False, "message": "只有管理员可以审批申请。"}
            target_request = next((item for item in state["requests"] if item.get("id") == request_id), None)
            if not target_request or target_request.get("status") != "pending":
                return {"success": False, "message": "申请不存在或已处理。"}
            user = self._find_user(state, target_request.get("applicant_id"))
            if not user:
                return {"success": False, "message": "申请对应账号不存在。"}
            if target_request.get("type") == "guest-registration":
                user["status"] = "active"
                user["role"] = "guest"
                user["joined_via"] = "admin-approve"
            else:
                user["role"] = "member"
            target_request["status"] = "approved"
            self._record_audit(state, "request-approve", f"{target_request['applicant_email']} 的 {target_request['desired_role']} 申请已批准")
            return {"success": True, "message": "申请已批准。"}

        return self._mutate(mutator)

    def reject_request(self, admin_id: str, request_id: str) -> Dict[str, Any]:
        def mutator(state: Dict[str, Any]):
            admin = self._find_user(state, admin_id)
            if not admin or admin.get("role") != "admin":
                return {"success": False, "message": "只有管理员可以驳回申请。"}
            target_request = next((item for item in state["requests"] if item.get("id") == request_id), None)
            if not target_request or target_request.get("status") != "pending":
                return {"success": False, "message": "申请不存在或已处理。"}
            target_request["status"] = "rejected"
            self._record_audit(state, "request-reject", f"{target_request['applicant_email']} 的 {target_request['desired_role']} 申请已驳回")
            return {"success": True, "message": "申请已驳回。"}

        return self._mutate(mutator)

    def set_user_role(self, admin_id: str, user_id: str, role: str) -> Dict[str, Any]:
        def mutator(state: Dict[str, Any]):
            admin = self._find_user(state, admin_id)
            if not admin or admin.get("role") != "admin":
                return {"success": False, "message": "只有管理员可以调整账号等级。"}
            if role not in {"member", "guest"}:
                return {"success": False, "message": "目标角色无效。"}
            user = self._find_user(state, user_id)
            if not user:
                return {"success": False, "message": "目标账号不存在。"}
            if user.get("role") == "admin":
                return {"success": False, "message": "管理员账号请使用专用转让流程。"}
            user["role"] = role
            user["status"] = "active"
            self._record_audit(state, "role-change", f"{user['email']} 被调整为 {role}")
            return {"success": True, "message": f"已将账号调整为{role}。"}

        return self._mutate(mutator)

    def set_role_page_permission(self, admin_id: str, role: str, page: str, allowed: bool) -> Dict[str, Any]:
        def mutator(state: Dict[str, Any]):
            admin = self._find_user(state, admin_id)
            if not admin or admin.get("role") != "admin":
                return {"success": False, "message": "只有管理员可以调整权限模板。"}
            if role not in {"member", "guest"} or page not in PAGE_ORDER:
                return {"success": False, "message": "权限模板参数无效。"}
            state["role_templates"][role]["pages"][page] = bool(allowed)
            self._record_audit(state, "page-permission-update", f"{role} 页面权限 {page} => {'允许' if allowed else '禁止'}")
            return {"success": True, "message": "页面权限模板已更新。"}

        return self._mutate(mutator)

    def set_role_action_permission(self, admin_id: str, role: str, action: str, allowed: bool) -> Dict[str, Any]:
        def mutator(state: Dict[str, Any]):
            admin = self._find_user(state, admin_id)
            if not admin or admin.get("role") != "admin":
                return {"success": False, "message": "只有管理员可以调整权限模板。"}
            if role not in {"member", "guest"} or action not in ACTION_ORDER:
                return {"success": False, "message": "权限模板参数无效。"}
            state["role_templates"][role]["actions"][action] = bool(allowed)
            self._record_audit(state, "action-permission-update", f"{role} 操作权限 {action} => {'允许' if allowed else '禁止'}")
            return {"success": True, "message": "操作权限模板已更新。"}

        return self._mutate(mutator)

    def update_register_policy(self, admin_id: str, patch: Dict[str, Any]) -> Dict[str, Any]:
        def mutator(state: Dict[str, Any]):
            admin = self._find_user(state, admin_id)
            if not admin or admin.get("role") != "admin":
                return {"success": False, "message": "只有管理员可以调整注册规则。"}
            state["register_policy"].update(patch or {})
            if "allowed_domains" in state["register_policy"]:
                state["register_policy"]["allowed_domains"] = [normalize(item) for item in state["register_policy"]["allowed_domains"] if item]
            self._record_audit(state, "register-policy-update", "管理员更新了注册与申请规则")
            return {"success": True, "message": "注册规则已更新。"}

        return self._mutate(mutator)

    def update_appearance_policy(self, admin_id: str, patch: Dict[str, Any]) -> Dict[str, Any]:
        def mutator(state: Dict[str, Any]):
            admin = self._find_user(state, admin_id)
            if not admin or admin.get("role") != "admin":
                return {"success": False, "message": "只有管理员可以调整个性化策略。"}
            state["appearance_policy"].update(patch or {})
            self._record_audit(state, "appearance-policy-update", "管理员更新了外观同步策略")
            return {"success": True, "message": "个性化策略已更新。"}

        return self._mutate(mutator)

    def record_audit_event(self, action: str, detail: str) -> None:
        def mutator(state: Dict[str, Any]):
            self._record_audit(state, action, detail)
            return None

        self._mutate(mutator)

    def transfer_admin(self, admin_id: str, target_user_id: str, token: str, code: str) -> Dict[str, Any]:
        def mutator(state: Dict[str, Any]):
            admin = self._find_user(state, admin_id)
            if not admin or admin.get("role") != "admin":
                return {"success": False, "message": "只有当前管理员可以转让管理员权限。"}
            target = self._find_user(state, target_user_id)
            if not target or target.get("status") != "active" or target.get("role") != "member":
                return {"success": False, "message": "管理员只能转让给已激活的成员账号。"}
            if not self.token_manager.verify_token(token or ""):
                return {"success": False, "message": "系统 Token 校验失败。"}
            if not self._consume_code(state, f"sensitive:{admin_id}:transfer-admin", code):
                return {"success": False, "message": "转让验证码无效。"}
            admin["role"] = "member"
            target["role"] = "admin"
            self._record_audit(state, "admin-transfer", f"管理员权限已转让给 {target['email']}")
            return {"success": True, "message": "管理员权限已成功转让。", "new_admin_user_id": target["id"]}

        return self._mutate(mutator)


class SessionManager:
    """登录会话管理。"""

    def __init__(self, token_mgr: TokenManager, store: AccountStore):
        self.token_manager = token_mgr
        self.account_store = store
        self.sessions: Dict[str, Dict[str, Any]] = {}
        self.max_attempts = LOGIN_FAIL_LIMIT

    def create_session(self, session_id: str) -> Dict[str, Any]:
        self.sessions[session_id] = {
            "attempts": 0,
            "lock_count": 0,
            "locked_until": None,
            "login_time": None,
            "user_id": None,
            "auth_type": None,
        }
        return self.sessions[session_id]

    def get_session(self, session_id: str) -> Dict[str, Any]:
        if session_id not in self.sessions:
            return self.create_session(session_id)
        return self.sessions[session_id]

    def _check_unlock(self, session: Dict[str, Any]):
        locked_until = session.get("locked_until")
        if locked_until and datetime.now() >= datetime.fromisoformat(locked_until):
            session["locked_until"] = None
            session["attempts"] = 0

    def is_locked(self, session_id: str) -> bool:
        session = self.get_session(session_id)
        self._check_unlock(session)
        return session.get("locked_until") is not None

    def get_lock_remaining_seconds(self, session_id: str) -> int:
        session = self.get_session(session_id)
        locked_until = session.get("locked_until")
        if not locked_until:
            return 0
        remaining = (datetime.fromisoformat(locked_until) - datetime.now()).total_seconds()
        return max(0, int(remaining))

    def _mark_failure(self, session: Dict[str, Any]):
        session["attempts"] = session.get("attempts", 0) + 1
        if session["attempts"] >= self.max_attempts:
            session["lock_count"] = session.get("lock_count", 0) + 1
            minutes = 2 ** (session["lock_count"] - 1)
            session["locked_until"] = (datetime.now() + timedelta(minutes=minutes)).isoformat()

    def _mark_success(self, session: Dict[str, Any], user_id: str, auth_type: str):
        session["attempts"] = 0
        session["lock_count"] = 0
        session["locked_until"] = None
        session["login_time"] = now_iso()
        session["user_id"] = user_id
        session["auth_type"] = auth_type

    def _is_session_expired(self, session: Dict[str, Any]) -> bool:
        login_time = session.get("login_time")
        if not login_time:
            return False
        try:
            return (datetime.now() - datetime.fromisoformat(login_time)).total_seconds() > SESSION_TTL_SECONDS
        except Exception:
            return True

    def rotate_session(self, old_session_id: Optional[str], new_session_id: str) -> Dict[str, Any]:
        old_session = self.get_session(old_session_id) if old_session_id else self.create_session(new_session_id)
        self.sessions[new_session_id] = dict(old_session)
        if old_session_id and old_session_id != new_session_id:
            self.sessions.pop(old_session_id, None)
        return self.sessions[new_session_id]

    def login_with_token(self, session_id: str, token: str) -> Dict[str, Any]:
        session = self.get_session(session_id)
        self._check_unlock(session)
        if session.get("locked_until"):
            return {"success": False, "message": "登录已锁定，请等待", "locked": True, "lock_seconds": self.get_lock_remaining_seconds(session_id)}
        if not self.token_manager.verify_token(token or ""):
            self._mark_failure(session)
            return {
                "success": False,
                "message": "Token错误，剩余尝试次数: %s" % self.get_remaining_attempts(session_id),
                "remaining_attempts": self.get_remaining_attempts(session_id),
                "locked": self.is_locked(session_id),
                "lock_seconds": self.get_lock_remaining_seconds(session_id),
            }
        admin = self.account_store.get_admin_user()
        self._mark_success(session, admin["id"], "token")
        return {"success": True, "message": "登录成功", "user": self.account_store._public_user(admin)}

    def login_oauth(self, session_id: str, user_id: str) -> Dict[str, Any]:
        session = self.get_session(session_id)
        user = self.account_store.get_user(user_id)
        if not user or user.get("status") != "active":
            return {"success": False, "message": "GitHub 账号不可登录。"}
        self._mark_success(session, user["id"], "github-oauth")
        return {"success": True, "message": "登录成功。", "user": self.account_store._public_user(user)}

    def login_account(self, session_id: str, identifier: str, password: str, code: str) -> Dict[str, Any]:
        session = self.get_session(session_id)
        self._check_unlock(session)
        if session.get("locked_until"):
            return {"success": False, "message": "登录已锁定，请等待", "locked": True, "lock_seconds": self.get_lock_remaining_seconds(session_id)}
        result = self.account_store.verify_account_login(identifier, password, code)
        if not result.get("success"):
            self._mark_failure(session)
            result["remaining_attempts"] = self.get_remaining_attempts(session_id)
            result["locked"] = self.is_locked(session_id)
            result["lock_seconds"] = self.get_lock_remaining_seconds(session_id)
            return result
        self._mark_success(session, result["user"]["id"], "account")
        result["remaining_attempts"] = 0
        result["locked"] = False
        result["lock_seconds"] = 0
        return result

    def is_logged_in(self, session_id: str) -> bool:
        session = self.get_session(session_id)
        self._check_unlock(session)
        if self._is_session_expired(session):
            self.logout(session_id)
            return False
        user_id = session.get("user_id")
        if not user_id or session.get("locked_until"):
            return False
        user = self.account_store.get_user(user_id)
        return bool(user and user.get("status") == "active")

    def get_remaining_attempts(self, session_id: str) -> int:
        return max(0, self.max_attempts - self.get_session(session_id).get("attempts", 0))

    def get_current_user(self, session_id: str) -> Optional[Dict[str, Any]]:
        if not self.is_logged_in(session_id):
            return None
        return self.account_store.get_user(self.get_session(session_id).get("user_id"))

    def logout(self, session_id: str):
        if session_id in self.sessions:
            del self.sessions[session_id]


class RequestRateLimiter:
    """简单的内存限流器。"""

    def __init__(self):
        self._lock = threading.Lock()
        self._hits: Dict[str, list[float]] = {}

    def check(self, key: str, limit: int, window_seconds: int) -> int:
        now = time.time()
        with self._lock:
            hits = [ts for ts in self._hits.get(key, []) if now - ts < window_seconds]
            if len(hits) >= limit:
                retry_after = max(1, int(window_seconds - (now - hits[0])))
                self._hits[key] = hits
                return retry_after
            hits.append(now)
            self._hits[key] = hits
        return 0


token_manager = TokenManager(P_CONFIG_PATH)
account_store = AccountStore(ACCOUNT_DATA_FILE, token_manager)
github_oauth_state_store = OAuthStateStore()
session_manager = SessionManager(token_manager, account_store)
request_rate_limiter = RequestRateLimiter()


def attach_request_auth_state(
    request: Request,
    session_id: Optional[str],
    auth_type: str = "session",
    user: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    resolved_user = user if user is not None else (session_manager.get_current_user(session_id) if session_id else None)
    request.state.session_id = session_id
    request.state.auth_type = auth_type
    request.state.account_user = resolved_user
    request.state.account_user_id = resolved_user.get("id") if resolved_user else None
    return resolved_user


def resolve_request_auth(request: Request) -> Optional[Dict[str, Any]]:
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        bearer_token = auth_header[7:].strip()
        if not bearer_token or not token_manager.verify_token(bearer_token):
            raise HTTPException(status_code=401, detail="Bearer Token 无效")
        admin_user = account_store.get_admin_user()
        return attach_request_auth_state(request, None, auth_type="bearer", user=admin_user)

    session_id = request.cookies.get("webui_session", "").strip()
    if not session_id:
        return attach_request_auth_state(request, None, auth_type="anonymous", user=None)

    user = session_manager.get_current_user(session_id)
    return attach_request_auth_state(request, session_id, auth_type="session", user=user)


def get_request_user(request: Request) -> Dict[str, Any]:
    user = getattr(request.state, "account_user", None)
    if user is None:
        user = resolve_request_auth(request)
    if not user:
        raise HTTPException(status_code=401, detail="请先登录")
    return user


def require_admin(request: Request) -> Dict[str, Any]:
    user = get_request_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="当前操作仅管理员可执行")
    return user


def require_action(action: str):
    def _dependency(request: Request):
        user = get_request_user(request)
        if not account_store.can_action(user, action):
            raise HTTPException(status_code=403, detail=f"当前账号缺少权限: {action}")
        return user

    return _dependency


def request_user_id(request: Request, fallback: str = "default") -> str:
    user = getattr(request.state, "account_user", None)
    if user is None:
        user = resolve_request_auth(request)
    if not user:
        return fallback
    return user.get("id") or fallback
