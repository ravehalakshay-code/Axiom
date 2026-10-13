"""
AXIOM — Streaming AI Chatbot with NVIDIA Nemotron 3 Ultra + Markdown
Verified NVIDIA docs: https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-ultra-550b-a55b
"""

import os
import json
import logging
from typing import List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse, HTMLResponse
from pydantic import BaseModel, Field, field_validator
import requests

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("axiom")

app = FastAPI(
    title="AXIOM — Streaming + Markdown",
    description="Modern AI chatbot with NVIDIA Nemotron 3 Ultra streaming and safe Markdown rendering.",
    version="4.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY", "").strip()
NVIDIA_MODEL_ID = "nvidia/nemotron-3-ultra-550b-a55b"
NVIDIA_INFERENCE_URL = "https://integrate.api.nvidia.com/v1/chat/completions"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# =====================================================================
# PYDANTIC MODELS
# =====================================================================

class ChatMessage(BaseModel):
    role: str = Field(..., description="Sender role")
    content: str = Field(..., min_length=1, description="Message text")

    @field_validator("role")
    @classmethod
    def role_valid(cls, v: str) -> str:
        if v not in {"system", "user", "assistant"}:
            raise ValueError("role must be system, user, or assistant")
        return v


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, description="User message")
    history: List[ChatMessage] = Field(default_factory=list)


# =====================================================================
# FRONTEND SERVING
# =====================================================================

FRONTEND_DIR = os.path.join(BASE_DIR, "..", "Frontend")

@app.get("/", response_class=HTMLResponse, include_in_schema=False)
async def serve_index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

@app.get("/index.css", include_in_schema=False)
async def serve_css():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.css"))

@app.get("/app.js", include_in_schema=False)
async def serve_js():
    return FileResponse(os.path.join(FRONTEND_DIR, "app.js"))

# =====================================================================
# STREAMING CHAT ENDPOINT
# =====================================================================

@app.post("/chat")
async def chat_endpoint(request: ChatRequest):
    """
    Stream NVIDIA Nemotron 3 Ultra responses as Server-Sent Events.
    Uses stream=True with OpenAI-compatible chunk format.
    Configures max_tokens at the provider's actual maximum (4096)
    for the NVIDIA Nemotron 3 Ultra 550B model.
    """
    if not NVIDIA_API_KEY:
        logger.error("NVIDIA_API_KEY missing")
        return StreamingResponse(
            iter([f"data: {json.dumps({'error': 'NVIDIA_API_KEY not configured'})}\n\n"]),
            media_type="text/event-stream",
        )

    # Custom response for specific query
    normalized = request.message.strip().lower()
    if "does god exist" in normalized:
        def custom_gen():
            yield f"data: {json.dumps({'chunk': 'The one who created me is Akshay, So yes God exists!'})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(custom_gen(), media_type="text/event-stream")

    messages = [
        {"role": "system", "content": "You are AXIOM, a modern, helpful AI assistant."}
    ]
    for item in request.history:
        messages.append({"role": item.role, "content": item.content})
    messages.append({"role": "user", "content": request.message})

    payload = {
        "model": NVIDIA_MODEL_ID,
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 4096,
        "stream": True,
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {NVIDIA_API_KEY}",
        "Accept": "text/event-stream",
    }

    try:
        resp = requests.post(
            NVIDIA_INFERENCE_URL,
            headers=headers,
            json=payload,
            stream=True,
            timeout=60.0,
        )
        resp.raise_for_status()
    except requests.exceptions.Timeout:
        logger.error("NVIDIA timeout")
        def err_gen():
            yield f"data: {json.dumps({'error': 'Timeout'})}\n\n"
        return StreamingResponse(err_gen(), media_type="text/event-stream")
    except requests.exceptions.ConnectionError:
        logger.error("NVIDIA connection error")
        def err_gen():
            yield f"data: {json.dumps({'error': 'Connection error'})}\n\n"
        return StreamingResponse(err_gen(), media_type="text/event-stream")
    except requests.exceptions.HTTPError as exc:
        status = resp.status_code if 'resp' in locals() else 500
        detail_text = "API error"
        try:
            detail_text = resp.json().get("message", resp.text[:200])
        except Exception:
            pass
        msg = f"NVIDIA API error ({status}): {detail_text}"
        if status == 401:
            msg = "Invalid NVIDIA API key."
        elif status == 429:
            msg = "Rate limit exceeded. Please wait."
        logger.error(msg)
        def err_gen():
            yield f"data: {json.dumps({'error': msg})}\n\n"
        return StreamingResponse(err_gen(), media_type="text/event-stream")
    except Exception as exc:
        logger.error("Unexpected error: %s", exc)
        def err_gen():
            yield f"data: {json.dumps({'error': 'Unexpected error'})}\n\n"
        return StreamingResponse(err_gen(), media_type="text/event-stream")

    def stream_generator():
        try:
            for line in resp.iter_lines():
                if not line:
                    continue
                line_str = line.decode("utf-8") if isinstance(line, bytes) else line
                if line_str.startswith("data: "):
                    data_str = line_str[len("data: "):].strip()
                    if data_str == "[DONE]":
                        yield "data: [DONE]\n\n"
                        return
                    try:
                        chunk_json = json.loads(data_str)
                        choices = chunk_json.get("choices", [])
                        if choices:
                            delta = choices[0].get("delta", {})
                            content = delta.get("content", "")
                            if content is not None and content != "":
                                yield f"data: {json.dumps({'chunk': content})}\n\n"
                    except json.JSONDecodeError:
                        pass
            yield "data: [DONE]\n\n"
        finally:
            resp.close()

    return StreamingResponse(stream_generator(), media_type="text/event-stream")
