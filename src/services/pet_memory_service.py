"""
桌宠长期记忆服务
提供轻量向量检索、长期事件提炼与用户映像递进式更新
"""
import hashlib
import math
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence

import structlog

from src.core.pet_database import PetDatabase
from src.services.memory_model_client import MemoryModelClient

logger = structlog.get_logger(__name__)

_WORD_RE = re.compile(r"[A-Za-z0-9_]+|[\u4e00-\u9fff]")
_SENTENCE_SPLIT_RE = re.compile(r"[\n。！？!?；;]+")


def _stable_hash(token: str) -> int:
    return int(hashlib.sha1(token.encode("utf-8")).hexdigest(), 16)


class PetMemoryService:
    """长期记忆与用户映像服务"""

    EMBEDDING_DIM = 128
    MAX_IMPRESSION_TOKENS = 1024
    MAX_ITEMS_PER_FACET = 6
    MEMORY_DIGEST_INTERVAL = 50
    IMPRESSION_BUILD_TURNS = (30, 50, 100, 150)
    IMPRESSION_REBUILD_INTERVAL = 150

    def __init__(self, db: PetDatabase):
        self.db = db

    def _normalize_stage_management_settings(
        self,
        memory_settings: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        memory = memory_settings if isinstance(memory_settings, dict) else {}
        stage_management = memory.get("stage_management", {}) if isinstance(memory.get("stage_management"), dict) else {}

        raw_build_turns = stage_management.get("impression_build_turns", list(self.IMPRESSION_BUILD_TURNS))
        build_turns: List[int] = []
        if isinstance(raw_build_turns, list):
            for item in raw_build_turns:
                try:
                    turn = int(item)
                except (TypeError, ValueError):
                    continue
                if turn <= 0 or turn in build_turns:
                    continue
                build_turns.append(turn)
        if not build_turns:
            build_turns = list(self.IMPRESSION_BUILD_TURNS)
        build_turns.sort()

        try:
            memory_digest_interval = int(stage_management.get("memory_digest_interval_turns", self.MEMORY_DIGEST_INTERVAL))
        except (TypeError, ValueError):
            memory_digest_interval = self.MEMORY_DIGEST_INTERVAL
        try:
            impression_rebuild_interval = int(stage_management.get("impression_rebuild_interval_turns", self.IMPRESSION_REBUILD_INTERVAL))
        except (TypeError, ValueError):
            impression_rebuild_interval = self.IMPRESSION_REBUILD_INTERVAL

        return {
            "memory_digest_interval_turns": max(1, memory_digest_interval),
            "impression_build_turns": build_turns,
            "impression_rebuild_interval_turns": max(1, impression_rebuild_interval),
        }

    def estimate_tokens(self, text: str) -> int:
        parts = _WORD_RE.findall(text or "")
        return max(1, len(parts))

    def _extract_terms(self, text: str) -> List[str]:
        raw_terms = [term.lower() for term in _WORD_RE.findall(text or "")]
        if not raw_terms:
            return []

        enriched = list(raw_terms)
        for i in range(len(raw_terms) - 1):
            left = raw_terms[i]
            right = raw_terms[i + 1]
            if len(left) == 1 and len(right) == 1:
                enriched.append(left + right)
        return enriched

    def build_embedding(self, text: str) -> List[float]:
        tokens = self._extract_terms(text)
        if not tokens:
            return [0.0] * self.EMBEDDING_DIM

        # 使用稳定哈希构造轻量向量，避免引入额外模型依赖。
        vector = [0.0] * self.EMBEDDING_DIM
        for token in tokens:
            index = _stable_hash(token) % self.EMBEDDING_DIM
            vector[index] += 1.0

        norm = math.sqrt(sum(value * value for value in vector)) or 1.0
        return [value / norm for value in vector]

    def _cosine_similarity(self, left: Sequence[float], right: Sequence[float]) -> float:
        if not left or not right:
            return 0.0
        size = min(len(left), len(right))
        if size == 0:
            return 0.0
        return sum(float(left[i]) * float(right[i]) for i in range(size))

    def _recentness_score(self, iso_time: str) -> float:
        try:
            delta = datetime.now() - datetime.fromisoformat(iso_time)
        except Exception:
            return 0.0
        hours = max(delta.total_seconds() / 3600.0, 0.0)
        return 1.0 / (1.0 + hours / 72.0)

    def _trim_to_token_limit(self, text: str, max_tokens: int) -> str:
        lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
        kept: List[str] = []
        total = 0
        for line in lines:
            line_tokens = self.estimate_tokens(line)
            if total + line_tokens > max_tokens:
                break
            kept.append(line)
            total += line_tokens
        return "\n".join(kept)

    def _unique_extend(self, base: List[str], incoming: Sequence[str], limit: int) -> List[str]:
        result = list(base)
        normalized = {item.strip(): item.strip() for item in result if item.strip()}
        for raw in incoming:
            item = str(raw or "").strip()
            if not item or item in normalized:
                continue
            result.append(item)
            normalized[item] = item
            if len(result) >= limit:
                break
        return result[:limit]

    def _default_impression_facets(self) -> Dict[str, List[str]]:
        return {
            "基础印象": [],
            "偏好与讨厌": [],
            "交流习惯": [],
            "近期状态": [],
            "重要事件": [],
        }

    def _merge_impression_facets(
        self,
        existing: Optional[Dict[str, List[str]]],
        updates: Dict[str, List[str]],
    ) -> Dict[str, List[str]]:
        merged = self._default_impression_facets()
        for key, values in (existing or {}).items():
            if key not in merged or not isinstance(values, list):
                continue
            merged[key] = self._unique_extend([], values, self.MAX_ITEMS_PER_FACET)
        for key, values in updates.items():
            if key not in merged:
                continue
            merged[key] = self._unique_extend(merged[key], values, self.MAX_ITEMS_PER_FACET)
        return merged

    def _render_impression_summary(
        self,
        persona: Dict[str, Any],
        facets: Dict[str, List[str]],
    ) -> str:
        persona_name = str((persona or {}).get("name", "") or "当前桌宠").strip()
        tone = str((persona or {}).get("tone", "") or "").strip()
        intro = f"以{persona_name}的视角形成的长期用户印象" + (f"（语气偏向：{tone}）" if tone else "")
        lines = [intro]
        for label, items in facets.items():
            if not items:
                continue
            lines.append(f"{label}:")
            for item in items:
                lines.append(f"- {item}")
        summary = "\n".join(lines)
        return self._trim_to_token_limit(summary, self.MAX_IMPRESSION_TOKENS)

    def should_digest_memory(
        self,
        turn_count: int,
        memory_settings: Optional[Dict[str, Any]] = None,
    ) -> bool:
        stage_management = self._normalize_stage_management_settings(memory_settings)
        interval = int(stage_management["memory_digest_interval_turns"])
        return turn_count > 0 and turn_count % interval == 0

    def should_build_impression(
        self,
        turn_count: int,
        memory_settings: Optional[Dict[str, Any]] = None,
    ) -> bool:
        stage_management = self._normalize_stage_management_settings(memory_settings)
        build_turns = tuple(stage_management["impression_build_turns"])
        rebuild_interval = int(stage_management["impression_rebuild_interval_turns"])
        if turn_count in build_turns:
            return True
        return turn_count > max(build_turns) and turn_count % rebuild_interval == 0

    def _extract_memory_candidates(
        self,
        user_message: str,
        actions: Optional[List[Dict[str, Any]]],
    ) -> List[Dict[str, Any]]:
        candidates: List[Dict[str, Any]] = []
        for raw_sentence in _SENTENCE_SPLIT_RE.split(user_message or ""):
            sentence = raw_sentence.strip()
            if len(sentence) < 4 or len(sentence) > 160:
                continue
            importance = 0.42
            tags: List[str] = []
            if any(keyword in sentence for keyword in ["喜欢", "不喜欢", "讨厌", "想要", "希望"]):
                importance = 0.82
                tags.append("偏好")
            elif any(keyword in sentence for keyword in ["我是", "我叫", "我在", "最近", "习惯", "平时"]):
                importance = 0.72
                tags.append("画像")
            elif any(keyword in sentence for keyword in ["明天", "今天", "下周", "之后", "计划", "安排"]):
                importance = 0.65
                tags.append("事件")
            if not tags:
                tags.append("聊天")

            normalized = re.sub(r"\s+", " ", sentence)
            event_key = hashlib.sha1(normalized.encode("utf-8")).hexdigest()
            candidates.append(
                {
                    "source": "user_message",
                    "content": sentence,
                    "summary": sentence,
                    "tags": tags,
                    "keywords": self._extract_terms(sentence)[:24],
                    "importance": importance,
                    "event_key": event_key,
                    "metadata": {"origin": "message"},
                }
            )

        for action in actions or []:
            function_name = str(action.get("function", "")).strip()
            arguments = action.get("arguments", {}) or {}
            result = action.get("result", {}) or {}
            if function_name == "create_schedule":
                summary = f"主人安排了日程：{arguments.get('title', '未命名日程')}"
            elif function_name == "create_todo":
                summary = f"主人新增了待办：{arguments.get('title', '未命名待办')}"
            elif function_name == "query_schedule":
                summary = "主人最近主动查询过日程安排"
            elif function_name == "query_todo":
                summary = "主人最近主动查询过待办事项"
            else:
                continue
            event_key = hashlib.sha1(f"{function_name}:{summary}".encode("utf-8")).hexdigest()
            candidates.append(
                {
                    "source": "tool_action",
                    "content": summary,
                    "summary": summary,
                    "tags": ["工具调用", function_name],
                    "keywords": self._extract_terms(summary),
                    "importance": 0.78,
                    "event_key": event_key,
                    "metadata": {"arguments": arguments, "result": result},
                }
            )

        return candidates[:12]

    def _extract_memory_candidates_from_messages(
        self,
        user_messages: Sequence[str],
        actions: Optional[List[Dict[str, Any]]],
    ) -> List[Dict[str, Any]]:
        candidates: List[Dict[str, Any]] = []
        for message in user_messages:
            candidates.extend(self._extract_memory_candidates(message, None))
        if actions:
            candidates.extend(self._extract_memory_candidates("", actions))
        return candidates[:24]

    def _extract_impression_updates(
        self,
        user_message: str,
        actions: Optional[List[Dict[str, Any]]],
    ) -> Dict[str, List[str]]:
        updates = self._default_impression_facets()
        message = str(user_message or "").strip()
        if not message:
            return updates

        if any(keyword in message for keyword in ["喜欢", "不喜欢", "讨厌", "想要", "希望"]):
            updates["偏好与讨厌"].append(message[:72])
        if any(keyword in message for keyword in ["我是", "我叫", "平时", "习惯", "最近"]):
            updates["基础印象"].append(message[:72])
        if any(keyword in message for keyword in ["提醒我", "记得", "帮我", "陪我", "聊天"]):
            updates["交流习惯"].append(message[:72])
        if any(keyword in message for keyword in ["累", "困", "忙", "开心", "难受", "焦虑", "压力"]):
            updates["近期状态"].append(message[:72])

        for action in actions or []:
            function_name = str(action.get("function", "")).strip()
            arguments = action.get("arguments", {}) or {}
            if function_name == "create_schedule":
                updates["重要事件"].append(f"主人新增了日程：{arguments.get('title', '未命名日程')}")
            elif function_name == "create_todo":
                updates["重要事件"].append(f"主人新增了待办：{arguments.get('title', '未命名待办')}")
        return updates

    def _merge_update_groups(
        self,
        base: Dict[str, List[str]],
        incoming: Dict[str, List[str]],
    ) -> Dict[str, List[str]]:
        merged = {key: list(values) for key, values in base.items()}
        for key, values in incoming.items():
            if key not in merged:
                continue
            merged[key] = self._unique_extend(merged[key], values, self.MAX_ITEMS_PER_FACET)
        return merged

    def _extract_impression_updates_from_messages(
        self,
        user_messages: Sequence[str],
        actions: Optional[List[Dict[str, Any]]],
    ) -> Dict[str, List[str]]:
        merged = self._default_impression_facets()
        for message in user_messages:
            merged = self._merge_update_groups(
                merged,
                self._extract_impression_updates(message, None),
            )
        if actions:
            merged = self._merge_update_groups(
                merged,
                self._extract_impression_updates("", actions),
            )
        return merged

    def _has_impression_updates(self, updates: Dict[str, List[str]]) -> bool:
        return any(values for values in updates.values())

    def _cursor_key(self, kind: str, session_id: str) -> str:
        return f"pet_stage::{kind}::{session_id}"

    async def _get_stage_messages(self, session_id: str, kind: str) -> List[Dict[str, Any]]:
        raw_cursor = await self.db.get_app_state(self._cursor_key(kind, session_id))
        try:
            after_id = int(str(raw_cursor or "0"))
        except Exception:
            after_id = 0
        return await self.db.get_session_messages_after_id(session_id, after_id)

    async def _advance_stage_cursor(
        self,
        session_id: str,
        kind: str,
        stage_messages: Sequence[Dict[str, Any]],
    ) -> None:
        if not stage_messages:
            return
        last_id = max(int(item.get("id") or 0) for item in stage_messages)
        await self.db.set_app_state(self._cursor_key(kind, session_id), str(last_id))

    def _collect_stage_material(
        self,
        stage_messages: Sequence[Dict[str, Any]],
    ) -> Dict[str, Any]:
        user_messages: List[str] = []
        actions: List[Dict[str, Any]] = []
        for item in stage_messages:
            role = str(item.get("role") or "").strip()
            content = str(item.get("content") or "").strip()
            metadata = item.get("metadata") or {}
            if role == "user" and content:
                user_messages.append(content)
            if role == "assistant" and isinstance(metadata.get("actions"), list):
                for action in metadata["actions"]:
                    if isinstance(action, dict):
                        actions.append(action)
        return {
            "user_messages": user_messages,
            "actions": actions,
            "message_count": len(stage_messages),
        }

    async def _ingest_memory_stage(
        self,
        model_key: str,
        session_id: str,
        turn_count: int,
        memory_settings: Optional[Dict[str, Any]],
    ) -> bool:
        stage_messages = await self._get_stage_messages(session_id, "memory")
        if not stage_messages:
            return False

        material = self._collect_stage_material(stage_messages)
        user_messages = material["user_messages"]
        actions = material["actions"]
        memory_candidates = self._extract_memory_candidates_from_messages(user_messages, actions)
        await self._advance_stage_cursor(session_id, "memory", stage_messages)
        if not memory_candidates:
            return False

        logger.info(
            "开始阶段性记忆整理",
            session_id=session_id,
            model_key=model_key,
            turn_count=turn_count,
            stage_message_count=material["message_count"],
            memory_candidate_count=len(memory_candidates),
        )

        memory_client = MemoryModelClient(memory_settings)
        embeddings = await memory_client.embed_texts([item["summary"] for item in memory_candidates])
        for index, item in enumerate(memory_candidates):
            embedding = self.build_embedding(item["summary"])
            if embeddings and index < len(embeddings) and embeddings[index]:
                embedding = embeddings[index]
            metadata = dict(item.get("metadata") or {})
            metadata.update(
                {
                    "origin": "stage_digest",
                    "turn_count": turn_count,
                    "stage_message_count": material["message_count"],
                }
            )
            await self.db.upsert_memory_entry(
                session_id=session_id,
                model_key=model_key,
                source=item["source"],
                content=item["content"],
                summary=item["summary"],
                tags=item["tags"],
                keywords=item["keywords"],
                embedding=embedding,
                importance=item["importance"],
                event_key=item["event_key"],
                metadata=metadata,
            )
        return True

    async def _ingest_impression_stage(
        self,
        model_key: str,
        session_id: str,
        persona: Dict[str, Any],
        turn_count: int,
    ) -> bool:
        stage_messages = await self._get_stage_messages(session_id, "impression")
        if not stage_messages:
            return False

        material = self._collect_stage_material(stage_messages)
        updates = self._extract_impression_updates_from_messages(
            material["user_messages"],
            material["actions"],
        )
        await self._advance_stage_cursor(session_id, "impression", stage_messages)
        if not self._has_impression_updates(updates):
            return False

        logger.info(
            "开始阶段性印象构建",
            session_id=session_id,
            model_key=model_key,
            turn_count=turn_count,
            stage_message_count=material["message_count"],
        )

        for scope_key, scope_session_id in (
            (f"session::{session_id}", session_id),
            (f"model::{model_key}", None),
        ):
            existing = await self.db.get_impression_profile(scope_key)
            merged_facets = self._merge_impression_facets(
                existing.get("facets") if existing else None,
                updates,
            )
            summary = self._render_impression_summary(persona, merged_facets)
            await self.db.upsert_impression_profile(
                scope_key=scope_key,
                model_key=model_key,
                session_id=scope_session_id,
                summary=summary,
                facets=merged_facets,
                token_estimate=self.estimate_tokens(summary),
            )
        return True

    async def retrieve_relevant_memories(
        self,
        model_key: str,
        session_id: str,
        share_across_sessions: bool,
        query_text: str,
        memory_settings: Optional[Dict[str, Any]] = None,
        limit: int = 6,
    ) -> List[Dict[str, Any]]:
        memory_client = MemoryModelClient(memory_settings)
        query_embedding = self.build_embedding(query_text)
        external_embeddings = await memory_client.embed_texts([query_text])
        if external_embeddings and external_embeddings[0]:
            query_embedding = external_embeddings[0]
        query_terms = set(self._extract_terms(query_text))
        entries = await self.db.list_memory_entries(
            model_key=model_key,
            session_id=session_id,
            include_all_sessions=share_across_sessions,
            limit=120,
        )

        scored: List[Dict[str, Any]] = []
        for entry in entries:
            entry_terms = set(str(term) for term in (entry.get("keywords") or []))
            lexical = len(query_terms & entry_terms) / max(len(query_terms) or 1, 1)
            vector = self._cosine_similarity(query_embedding, entry.get("embedding") or [])
            importance = float(entry.get("importance") or 0.5)
            recency = self._recentness_score(str(entry.get("updated_at") or ""))
            score = vector * 0.54 + lexical * 0.24 + importance * 0.14 + recency * 0.08
            if score < 0.12:
                continue
            candidate = dict(entry)
            candidate["score"] = round(score, 4)
            scored.append(candidate)

        scored.sort(key=lambda item: (item["score"], item.get("updated_at", "")), reverse=True)
        top_items = scored[: max(limit * 2, limit)]
        reranked = await memory_client.rerank(query_text, top_items, top_n=limit)
        if reranked:
            top_items = reranked[:limit]
        else:
            top_items = top_items[:limit]
        await self.db.touch_memory_entries([int(item["id"]) for item in top_items])
        return top_items

    async def get_impression_text(
        self,
        model_key: str,
        session_id: str,
        share_across_sessions: bool,
    ) -> str:
        primary_scope = f"model::{model_key}" if share_across_sessions else f"session::{session_id}"
        profile = await self.db.get_impression_profile(primary_scope)
        if profile:
            return str(profile.get("summary") or "").strip()

        fallback_scope = f"session::{session_id}" if share_across_sessions else f"model::{model_key}"
        fallback = await self.db.get_impression_profile(fallback_scope)
        return str((fallback or {}).get("summary") or "").strip()

    async def ingest_exchange(
        self,
        model_key: str,
        session_id: str,
        persona: Dict[str, Any],
        user_message: str,
        assistant_reply: str,
        actions: Optional[List[Dict[str, Any]]],
        memory_settings: Optional[Dict[str, Any]] = None,
        turn_count: Optional[int] = None,
    ) -> Dict[str, Any]:
        if turn_count:
            memory_due = self.should_digest_memory(turn_count, memory_settings)
            impression_due = self.should_build_impression(turn_count, memory_settings)
            if not memory_due and not impression_due:
                return {
                    "memory_updated": False,
                    "impression_updated": False,
                    "turn_count": turn_count,
                }

            memory_updated = False
            impression_updated = False
            if memory_due:
                memory_updated = await self._ingest_memory_stage(
                    model_key=model_key,
                    session_id=session_id,
                    turn_count=turn_count,
                    memory_settings=memory_settings,
                )
            if impression_due:
                impression_updated = await self._ingest_impression_stage(
                    model_key=model_key,
                    session_id=session_id,
                    persona=persona,
                    turn_count=turn_count,
                )
            return {
                "memory_updated": memory_updated,
                "impression_updated": impression_updated,
                "turn_count": turn_count,
            }

        memory_candidates = self._extract_memory_candidates(user_message, actions)
        memory_client = MemoryModelClient(memory_settings)
        embeddings = await memory_client.embed_texts([item["summary"] for item in memory_candidates])
        for index, item in enumerate(memory_candidates):
            embedding = self.build_embedding(item["summary"])
            if embeddings:
                if index < len(embeddings) and embeddings[index]:
                    embedding = embeddings[index]
            await self.db.upsert_memory_entry(
                session_id=session_id,
                model_key=model_key,
                source=item["source"],
                content=item["content"],
                summary=item["summary"],
                tags=item["tags"],
                keywords=item["keywords"],
                embedding=embedding,
                importance=item["importance"],
                event_key=item["event_key"],
                metadata=item["metadata"],
            )

        updates = self._extract_impression_updates(user_message, actions)
        for scope_key, scope_session_id in (
            (f"session::{session_id}", session_id),
            (f"model::{model_key}", None),
        ):
            existing = await self.db.get_impression_profile(scope_key)
            merged_facets = self._merge_impression_facets(
                existing.get("facets") if existing else None,
                updates,
            )
            summary = self._render_impression_summary(persona, merged_facets)
            await self.db.upsert_impression_profile(
                scope_key=scope_key,
                model_key=model_key,
                session_id=scope_session_id,
                summary=summary,
                facets=merged_facets,
                token_estimate=self.estimate_tokens(summary),
            )
        return {
            "memory_updated": bool(memory_candidates),
            "impression_updated": self._has_impression_updates(updates),
            "turn_count": turn_count,
        }
