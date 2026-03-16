"""
LLM客户端封装模块
提供统一的LLM调用接口，支持OpenAI、Gemini、Claude等多种提供商
"""
import structlog
import json
from typing import Dict, Any, List, Optional, AsyncGenerator

logger = structlog.get_logger(__name__)
MASKED_API_KEY_PLACEHOLDER = "***已配置***"


def _normalize_api_key(raw_value: Any) -> str:
    """将 API Key 统一清洗为可安全用于请求头的 ASCII 字符串。"""
    api_key = str(raw_value or "").strip()
    if not api_key:
        return ""
    if api_key == MASKED_API_KEY_PLACEHOLDER:
        logger.warning("检测到被掩码的API Key占位符，将按未配置处理")
        return ""
    if not api_key.isascii():
        logger.warning("检测到包含非ASCII字符的API Key，将按未配置处理")
        return ""
    return api_key


class LLMClient:
    """LLM客户端封装类"""

    def __init__(self, config: Dict[str, Any]):
        """
        初始化LLM客户端

        Args:
            config: LLM配置字典，包含provider、api_key、base_url等
        """
        self.config = config
        self.provider = config.get("provider", "openai")
        self.model = config.get("model", "gpt-4o-mini")
        self.temperature = config.get("temperature", 0.7)
        self.max_tokens = config.get("max_tokens", 1000)
        self.timeout = config.get("timeout", 30)
        self.api_key = _normalize_api_key(config.get("api_key", ""))
        self.base_url = str(config.get("base_url", "https://api.openai.com/v1") or "https://api.openai.com/v1").strip()

        # 根据provider初始化对应的客户端
        self.client = None
        self.async_client = None

        if self.provider in ["openai", "azure"]:
            self._init_openai_client()
        elif self.provider == "gemini":
            self._init_gemini_client()
        elif self.provider == "claude":
            self._init_claude_client()

        logger.info("LLM客户端初始化完成", provider=self.provider, model=self.model)

    def _init_openai_client(self):
        """初始化OpenAI客户端"""
        try:
            from openai import OpenAI, AsyncOpenAI

            self.client = OpenAI(
                api_key=self.api_key or "dummy",
                base_url=self.base_url,
                timeout=self.timeout
            )
            self.async_client = AsyncOpenAI(
                api_key=self.api_key or "dummy",
                base_url=self.base_url,
                timeout=self.timeout
            )
        except ImportError:
            logger.error("OpenAI SDK未安装")
            raise

    def _init_gemini_client(self):
        """初始化Gemini客户端"""
        try:
            import google.generativeai as genai
            genai.configure(api_key=self.api_key)
            self.client = genai
        except ImportError:
            logger.error("Gemini SDK未安装，请运行: pip install google-generativeai")
            raise

    def _init_claude_client(self):
        """初始化Claude客户端"""
        try:
            from anthropic import Anthropic, AsyncAnthropic
            self.client = Anthropic(api_key=self.api_key, timeout=self.timeout)
            self.async_client = AsyncAnthropic(api_key=self.api_key, timeout=self.timeout)
        except ImportError:
            logger.error("Anthropic SDK未安装，请运行: pip install anthropic")
            raise


    async def chat(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict]] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        异步聊天接口

        Args:
            messages: 消息列表，格式为 [{"role": "user", "content": "..."}]
            tools: 可选的工具列表（Function Calling）
            temperature: 可选的温度参数
            max_tokens: 可选的最大token数

        Returns:
            包含回复内容和工具调用的字典
        """
        if self.provider in ["openai", "azure"]:
            return await self._chat_openai(messages, tools, temperature, max_tokens)
        elif self.provider == "gemini":
            return await self._chat_gemini(messages, tools, temperature, max_tokens)
        elif self.provider == "claude":
            return await self._chat_claude(messages, tools, temperature, max_tokens)
        else:
            raise ValueError(f"不支持的provider: {self.provider}")

    async def _chat_openai(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict]] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None
    ) -> Dict[str, Any]:
        """OpenAI格式的聊天"""
        try:
            if not self.is_configured():
                raise ValueError("OpenAI API Key 未配置或格式无效")

            kwargs = {
                "model": self.model,
                "messages": messages,
                "temperature": temperature or self.temperature,
                "max_tokens": max_tokens or self.max_tokens
            }

            if tools:
                kwargs["tools"] = tools
                kwargs["tool_choice"] = "auto"

            logger.debug("调用OpenAI API", model=self.model, message_count=len(messages))

            response = await self.async_client.chat.completions.create(**kwargs)

            # 解析响应
            message = response.choices[0].message
            result = {
                "content": message.content or "",
                "role": message.role,
                "finish_reason": response.choices[0].finish_reason
            }

            # 如果有工具调用
            if message.tool_calls:
                result["tool_calls"] = [
                    {
                        "id": tc.id,
                        "type": tc.type,
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments
                        }
                    }
                    for tc in message.tool_calls
                ]

            logger.info("OpenAI调用成功", finish_reason=result["finish_reason"])
            return result

        except Exception as e:
            logger.error("OpenAI调用失败", error=str(e), error_type=type(e).__name__)
            raise

    async def _chat_gemini(
        self,
        messages: List[Dict[str, str]],
        tools: Optional[List[Dict]] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None
    ) -> Dict[str, Any]:
        """Gemini格式的聊天"""
        try:
            import google.generativeai as genai

            # 转换消息格式
            gemini_messages = []
            system_instruction = None

            for msg in messages:
                if msg["role"] == "system":
                    system_instruction = msg["content"]
                elif msg["role"] == "user":
                    gemini_messages.append({"role": "user", "parts": [msg["content"]]})
                elif msg["role"] == "assistant":
                    gemini_messages.append({"role": "model", "parts": [msg["content"]]})

            # 配置生成参数
            generation_config = {
                "temperature": temperature or self.temperature,
                "max_output_tokens": max_tokens or self.max_tokens,
            }

            # 转换工具格式
            gemini_tools = None
            if tools:
                gemini_tools = self._convert_tools_to_gemini(tools)

            # 创建模型
            model = genai.GenerativeModel(
                model_name=self.model,
                generation_config=generation_config,
                system_instruction=system_instruction,
                tools=gemini_tools
            )

            logger.debug("调用Gemini API", model=self.model, message_count=len(gemini_messages))

            # 发送请求
            chat = model.start_chat(history=gemini_messages[:-1] if len(gemini_messages) > 1 else [])
            response = await chat.send_message_async(gemini_messages[-1]["parts"][0])

            # 解析响应
            result = {
                "content": response.text if response.text else "",
                "role": "assistant",
                "finish_reason": "stop"
            }

            # 检查是否有函数调用
            if response.candidates[0].content.parts:
                for part in response.candidates[0].content.parts:
                    if hasattr(part, 'function_call') and part.function_call:
                        if "tool_calls" not in result:
                            result["tool_calls"] = []
                        result["tool_calls"].append({
                            "id": f"call_{len(result['tool_calls'])}",
                            "type": "function",
                            "function": {
                                "name": part.function_call.name,
                                "arguments": json.dumps(dict(part.function_call.args))
                            }
                        })

            logger.info("Gemini调用成功")
            return result

        except Exception as e:
            logger.error("Gemini调用失败", error=str(e), error_type=type(e).__name__)
            raise

    async def _chat_claude(
        self,
        messages: List[Dict[str, str]],
        tools: Optional[List[Dict]] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None
    ) -> Dict[str, Any]:
        """Claude格式的聊天"""
        try:
            # 提取system消息
            system_message = None
            claude_messages = []

            for msg in messages:
                if msg["role"] == "system":
                    system_message = msg["content"]
                else:
                    claude_messages.append({
                        "role": msg["role"],
                        "content": msg["content"]
                    })

            # 构建请求参数
            kwargs = {
                "model": self.model,
                "messages": claude_messages,
                "temperature": temperature or self.temperature,
                "max_tokens": max_tokens or self.max_tokens
            }

            if system_message:
                kwargs["system"] = system_message

            # 转换工具格式
            if tools:
                kwargs["tools"] = self._convert_tools_to_claude(tools)

            logger.debug("调用Claude API", model=self.model, message_count=len(claude_messages))

            response = await self.async_client.messages.create(**kwargs)

            # 解析响应
            result = {
                "content": "",
                "role": "assistant",
                "finish_reason": response.stop_reason
            }

            # 处理内容块
            for block in response.content:
                if block.type == "text":
                    result["content"] += block.text
                elif block.type == "tool_use":
                    if "tool_calls" not in result:
                        result["tool_calls"] = []
                    result["tool_calls"].append({
                        "id": block.id,
                        "type": "function",
                        "function": {
                            "name": block.name,
                            "arguments": json.dumps(block.input)
                        }
                    })

            logger.info("Claude调用成功", finish_reason=result["finish_reason"])
            return result

        except Exception as e:
            logger.error("Claude调用失败", error=str(e), error_type=type(e).__name__)
            raise


    def _convert_tools_to_gemini(self, tools: List[Dict]) -> List:
        """将OpenAI格式的工具转换为Gemini格式"""
        import google.generativeai as genai

        gemini_tools = []
        for tool in tools:
            if tool["type"] == "function":
                func = tool["function"]
                gemini_tools.append(
                    genai.protos.Tool(
                        function_declarations=[
                            genai.protos.FunctionDeclaration(
                                name=func["name"],
                                description=func["description"],
                                parameters=func["parameters"]
                            )
                        ]
                    )
                )
        return gemini_tools

    def _convert_tools_to_claude(self, tools: List[Dict]) -> List[Dict]:
        """将OpenAI格式的工具转换为Claude格式"""
        claude_tools = []
        for tool in tools:
            if tool["type"] == "function":
                func = tool["function"]
                claude_tools.append({
                    "name": func["name"],
                    "description": func["description"],
                    "input_schema": func["parameters"]
                })
        return claude_tools

    async def chat_stream(
        self,
        messages: List[Dict[str, Any]],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None
    ) -> AsyncGenerator[str, None]:
        """
        异步流式聊天接口

        Args:
            messages: 消息列表
            temperature: 可选的温度参数
            max_tokens: 可选的最大token数

        Yields:
            流式返回的文本片段
        """
        if self.provider in ["openai", "azure"]:
            async for chunk in self._chat_stream_openai(messages, temperature, max_tokens):
                yield chunk
        elif self.provider == "gemini":
            async for chunk in self._chat_stream_gemini(messages, temperature, max_tokens):
                yield chunk
        elif self.provider == "claude":
            async for chunk in self._chat_stream_claude(messages, temperature, max_tokens):
                yield chunk
        else:
            raise ValueError(f"不支持的provider: {self.provider}")

    async def _chat_stream_openai(
        self,
        messages: List[Dict[str, Any]],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None
    ) -> AsyncGenerator[str, None]:
        """OpenAI流式聊天"""
        try:
            if not self.is_configured():
                raise ValueError("OpenAI API Key 未配置或格式无效")

            kwargs = {
                "model": self.model,
                "messages": messages,
                "temperature": temperature or self.temperature,
                "max_tokens": max_tokens or self.max_tokens,
                "stream": True
            }

            logger.debug("调用OpenAI流式API", model=self.model)

            stream = await self.async_client.chat.completions.create(**kwargs)

            async for chunk in stream:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content

        except Exception as e:
            logger.error("OpenAI流式调用失败", error=str(e))
            raise

    async def _chat_stream_gemini(
        self,
        messages: List[Dict[str, str]],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None
    ) -> AsyncGenerator[str, None]:
        """Gemini流式聊天"""
        try:
            import google.generativeai as genai

            # 转换消息格式
            gemini_messages = []
            system_instruction = None

            for msg in messages:
                if msg["role"] == "system":
                    system_instruction = msg["content"]
                elif msg["role"] == "user":
                    gemini_messages.append({"role": "user", "parts": [msg["content"]]})
                elif msg["role"] == "assistant":
                    gemini_messages.append({"role": "model", "parts": [msg["content"]]})

            generation_config = {
                "temperature": temperature or self.temperature,
                "max_output_tokens": max_tokens or self.max_tokens,
            }

            model = genai.GenerativeModel(
                model_name=self.model,
                generation_config=generation_config,
                system_instruction=system_instruction
            )

            logger.debug("调用Gemini流式API", model=self.model)

            chat = model.start_chat(history=gemini_messages[:-1] if len(gemini_messages) > 1 else [])
            response = await chat.send_message_async(
                gemini_messages[-1]["parts"][0],
                stream=True
            )

            async for chunk in response:
                if chunk.text:
                    yield chunk.text

        except Exception as e:
            logger.error("Gemini流式调用失败", error=str(e))
            raise

    async def _chat_stream_claude(
        self,
        messages: List[Dict[str, str]],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None
    ) -> AsyncGenerator[str, None]:
        """Claude流式聊天"""
        try:
            # 提取system消息
            system_message = None
            claude_messages = []

            for msg in messages:
                if msg["role"] == "system":
                    system_message = msg["content"]
                else:
                    claude_messages.append({
                        "role": msg["role"],
                        "content": msg["content"]
                    })

            logger.debug("调用Claude流式API", model=self.model)

            async with self.async_client.messages.stream(
                model=self.model,
                max_tokens=max_tokens or self.max_tokens,
                temperature=temperature or self.temperature,
                system=system_message,
                messages=claude_messages
            ) as stream:
                async for text in stream.text_stream:
                    yield text

        except Exception as e:
            logger.error("Claude流式调用失败", error=str(e))
            raise

    def is_configured(self) -> bool:
        """检查LLM是否已正确配置"""
        return bool(self.api_key and self.api_key != "dummy")
