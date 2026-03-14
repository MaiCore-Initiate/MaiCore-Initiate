"""
长期记忆外部模型客户端
支持可选的 embedding / rerank API，并在失败时自动回退
"""
from typing import Any, Dict, List, Optional

import httpx
import structlog

logger = structlog.get_logger(__name__)


def _normalize_endpoint(base_url: str, suffix: str) -> str:
    normalized = str(base_url or "").strip().rstrip("/")
    if not normalized:
        return ""
    if normalized.endswith(suffix):
        return normalized
    return f"{normalized}{suffix}"


def _safe_api_key(value: Any) -> str:
    return str(value or "").strip()


class MemoryModelClient:
    """长期记忆检索相关的外部模型客户端"""

    def __init__(self, memory_settings: Optional[Dict[str, Any]] = None):
        self.memory_settings = memory_settings if isinstance(memory_settings, dict) else {}
        self.embedding_config = self.memory_settings.get("embedding", {}) if isinstance(self.memory_settings.get("embedding"), dict) else {}
        self.rerank_config = self.memory_settings.get("rerank", {}) if isinstance(self.memory_settings.get("rerank"), dict) else {}

    def _timeout(self) -> float:
        raw = self.memory_settings.get("request_timeout_seconds", 3.5)
        try:
            timeout = float(raw)
        except Exception:
            timeout = 3.5
        return max(1.0, min(timeout, 10.0))

    def has_embedding(self) -> bool:
        return bool(
            str(self.embedding_config.get("base_url", "")).strip()
            and str(self.embedding_config.get("model", "")).strip()
        )

    def has_rerank(self) -> bool:
        return bool(
            str(self.rerank_config.get("base_url", "")).strip()
            and str(self.rerank_config.get("model", "")).strip()
        )

    async def embed_texts(self, texts: List[str]) -> Optional[List[List[float]]]:
        clean_texts = [str(item or "").strip() for item in texts if str(item or "").strip()]
        if not clean_texts or not self.has_embedding():
            return None

        url = _normalize_endpoint(str(self.embedding_config.get("base_url", "")), "/embeddings")
        payload = {
            "model": str(self.embedding_config.get("model", "")).strip(),
            "input": clean_texts,
        }
        headers = {"Content-Type": "application/json"}
        api_key = _safe_api_key(self.embedding_config.get("api_key"))
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        try:
            async with httpx.AsyncClient(timeout=self._timeout()) as client:
                response = await client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()
            items = data.get("data") if isinstance(data, dict) else None
            if not isinstance(items, list):
                return None

            vectors: List[List[float]] = []
            for item in items:
                embedding = item.get("embedding") if isinstance(item, dict) else None
                if not isinstance(embedding, list):
                    return None
                vectors.append([float(value) for value in embedding])

            if len(vectors) != len(clean_texts):
                logger.warning("外部 embedding 返回数量不匹配", expected=len(clean_texts), actual=len(vectors))
                return None
            return vectors
        except Exception as exc:
            logger.warning("外部 embedding 调用失败，回退本地检索", error=str(exc))
            return None

    async def rerank(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        top_n: Optional[int] = None,
    ) -> Optional[List[Dict[str, Any]]]:
        if not documents or not self.has_rerank():
            return None

        url = _normalize_endpoint(str(self.rerank_config.get("base_url", "")), "/rerank")
        payload = {
            "model": str(self.rerank_config.get("model", "")).strip(),
            "query": str(query or "").strip(),
            "documents": [str(item.get("summary") or item.get("content") or "").strip() for item in documents],
            "top_n": int(top_n or len(documents)),
            "return_documents": False,
        }
        headers = {"Content-Type": "application/json"}
        api_key = _safe_api_key(self.rerank_config.get("api_key"))
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        try:
            async with httpx.AsyncClient(timeout=self._timeout()) as client:
                response = await client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()

            raw_results = []
            if isinstance(data, dict):
                if isinstance(data.get("results"), list):
                    raw_results = data["results"]
                elif isinstance(data.get("data"), list):
                    raw_results = data["data"]
            if not raw_results:
                return None

            rescored: List[Dict[str, Any]] = []
            for raw in raw_results:
                if not isinstance(raw, dict):
                    continue
                index = raw.get("index")
                if not isinstance(index, int) or index < 0 or index >= len(documents):
                    continue
                score = raw.get("relevance_score", raw.get("score", 0.0))
                item = dict(documents[index])
                item["rerank_score"] = float(score or 0.0)
                item["score"] = round(float(item.get("score") or 0.0) * 0.42 + float(item["rerank_score"]) * 0.58, 4)
                rescored.append(item)

            if not rescored:
                return None
            rescored.sort(key=lambda item: float(item.get("score") or 0.0), reverse=True)
            return rescored
        except Exception as exc:
            logger.warning("外部 rerank 调用失败，保留本地排序", error=str(exc))
            return None
