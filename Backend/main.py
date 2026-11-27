"""
AXIOM — Streaming AI Chatbot with NVIDIA Nemotron 3 Ultra + Markdown
Verified NVIDIA docs: https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-ultra-550b-a55b
"""

import os
import json
import logging
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import List, Optional

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
    version="4.1.0",
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
DB_PATH = os.path.join(BASE_DIR, "axiom.db")


# =====================================================================
# DATABASE LAYER (SQLite)
# =====================================================================

def get_db() -> sqlite3.Connection:
    """Create a new SQLite connection per request."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    """Create tables and indexes if they don't exist."""
    conn = get_db()
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT 'New Conversation',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
                content TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_conversations_session_id
                ON conversations(session_id);
            CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
                ON messages(conversation_id);
            CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
                ON conversations(updated_at DESC);
            """
        )
        conn.commit()
    finally:
        conn.close()


# Initialize database on startup
init_db()


def now_iso() -> str:
    """Return current UTC timestamp in ISO 8601 format."""
    return datetime.now(timezone.utc).isoformat()


def verify_conversation_ownership(
    conn: sqlite3.Connection, conversation_id: str, session_id: str
) -> bool:
    """Check that a conversation belongs to the given session."""
    row = conn.execute(
        "SELECT id FROM conversations WHERE id = ? AND session_id = ?",
        (conversation_id, session_id),
    ).fetchone()
    return row is not None


# =====================================================================
# TITLE GENERATION
# =====================================================================

_STOP_WORDS = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "can", "must", "shall", "i", "me", "my",
    "myself", "we", "our", "ours", "ourselves", "you", "your", "yours",
    "yourself", "yourselves", "he", "him", "his", "himself", "she", "her",
    "hers", "herself", "it", "its", "itself", "they", "them", "their",
    "theirs", "themselves", "what", "which", "who", "whom", "whose",
    "where", "when", "why", "how", "all", "any", "both", "each", "few",
    "more", "most", "other", "some", "such", "no", "nor", "not", "only",
    "own", "same", "so", "than", "too", "very", "just", "also", "now",
    "then", "here", "there", "when", "where", "why", "how", "please",
    "help", "tell", "show", "give", "explain", "describe", "can you",
    "could you", "would you", "do you", "did you", "does it",
}

_QUESTION_STARTS = {
    "what", "how", "why", "where", "when", "who", "which", "can", "could",
    "would", "should", "do", "does", "did", "is", "are", "was", "were",
    "will", "may", "might", "please", "tell", "explain", "describe",
    "help", "show", "give",
}


def generate_title(first_message: str) -> str:
    """Generate a concise conversation title (3-7 words) from the first user message.

    Uses lightweight keyword extraction - no NVIDIA API call needed.
    Falls back to 'New Conversation' if the message is too short or unclear.
    """
    if not first_message or not first_message.strip():
        return "New Conversation"

    text = first_message.strip()

    # Remove trailing punctuation and question marks
    text = text.rstrip("?.!")

    # Split into words, remove punctuation
    raw_words = text.split()
    words = []
    for w in raw_words:
        clean = w.strip('",.;:()[]{}').lower()
        if clean and clean not in _STOP_WORDS:
            words.append(clean)

    # If message starts with a question word, skip it
    if words and words[0] in _QUESTION_STARTS:
        words = words[1:]

    if not words:
        return "New Conversation"

    # Take 3-7 meaningful words
    title_words = words[:7]

    # Capitalize each word
    title = " ".join(w.capitalize() for w in title_words)

    # Ensure title is not too short (less than 3 meaningful words)
    if len(title_words) < 3 and len(text) >= 10:
        # Use first few words of original message as fallback
        fallback_words = raw_words[:5]
        title = " ".join(w.strip('",.;:()[]{}').capitalize() for w in fallback_words if w.strip('",.;:()[]{}'))

    return title if title else "New Conversation"


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
    session_id: Optional[str] = Field(
        None, description="Anonymous session identifier"
    )
    conversation_id: Optional[str] = Field(
        None, description="Existing conversation to continue"
    )


class ConversationCreate(BaseModel):
    session_id: str = Field(..., description="Anonymous session identifier")
    title: str = Field(default="New Conversation", min_length=1)
    first_message: Optional[str] = Field(
        None, description="First user message for auto title generation"
    )


class ConversationResponse(BaseModel):
    id: str
    session_id: str
    title: str
    created_at: str
    updated_at: str


class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    created_at: str


class ConversationDetail(BaseModel):
    id: str
    session_id: str
    title: str
    created_at: str
    updated_at: str
    messages: List[MessageResponse] = []


class ConversationRename(BaseModel):
    title: str = Field(..., min_length=1)


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
# CONVERSATION CRUD ENDPOINTS
# =====================================================================

@app.post("/conversations", response_model=ConversationResponse)
async def create_conversation(payload: ConversationCreate):
    """Create a new conversation for the given session."""
    conn = get_db()
    try:
        conv_id = str(uuid.uuid4())
        created = now_iso()
        # Auto-generate title from first message if title is default
        title = payload.title
        if (title == "New Conversation" or not title.strip()) and payload.first_message:
            title = generate_title(payload.first_message)
        conn.execute(
            """
            INSERT INTO conversations (id, session_id, title, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (conv_id, payload.session_id, title, created, created),
        )
        conn.commit()
        return ConversationResponse(
            id=conv_id,
            session_id=payload.session_id,
            title=title,
            created_at=created,
            updated_at=created,
        )
    except sqlite3.IntegrityError as exc:
        logger.error("Conversation creation failed: %s", exc)
        raise HTTPException(status_code=400, detail="Could not create conversation")
    finally:
        conn.close()


@app.get("/conversations", response_model=List[ConversationResponse])
async def list_conversations(session_id: str):
    """Retrieve all conversations for a session, most recent first."""
    conn = get_db()
    try:
        rows = conn.execute(
            """
            SELECT id, session_id, title, created_at, updated_at
            FROM conversations
            WHERE session_id = ?
            ORDER BY updated_at DESC
            """,
            (session_id,),
        ).fetchall()
        return [
            ConversationResponse(
                id=row["id"],
                session_id=row["session_id"],
                title=row["title"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )
            for row in rows
        ]
    finally:
        conn.close()


@app.get("/conversations/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(conversation_id: str, session_id: str):
    """Retrieve a conversation and its messages, verifying session ownership."""
    conn = get_db()
    try:
        # First check if the conversation exists at all
        conv_row = conn.execute(
            """
            SELECT id, session_id, title, created_at, updated_at
            FROM conversations
            WHERE id = ?
            """,
            (conversation_id,),
        ).fetchone()
        if not conv_row:
            logger.warning(f"Get failed: conversation {conversation_id} not found in database")
            raise HTTPException(status_code=404, detail="Conversation not found")

        # Then check session ownership
        if conv_row["session_id"] != session_id:
            logger.warning(
                f"Get failed: conversation {conversation_id} owned by session "
                f"{conv_row['session_id']}, requested by session {session_id}"
            )
            raise HTTPException(
                status_code=403,
                detail="Access denied: conversation belongs to another session",
            )

        msg_rows = conn.execute(
            """
            SELECT id, role, content, created_at
            FROM messages
            WHERE conversation_id = ?
            ORDER BY created_at ASC
            """,
            (conversation_id,),
        ).fetchall()

        return ConversationDetail(
            id=conv_row["id"],
            session_id=conv_row["session_id"],
            title=conv_row["title"],
            created_at=conv_row["created_at"],
            updated_at=conv_row["updated_at"],
            messages=[
                MessageResponse(
                    id=row["id"],
                    role=row["role"],
                    content=row["content"],
                    created_at=row["created_at"],
                )
                for row in msg_rows
            ],
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to retrieve conversation: %s", exc)
        raise HTTPException(status_code=500, detail="Could not retrieve conversation")
    finally:
        conn.close()


@app.patch("/conversations/{conversation_id}", response_model=ConversationResponse)
async def rename_conversation(
    conversation_id: str, payload: ConversationRename, session_id: str
):
    """Rename a conversation (session ownership verified)."""
    conn = get_db()
    try:
        # First check if the conversation exists at all
        conv_row = conn.execute(
            "SELECT id, session_id FROM conversations WHERE id = ?",
            (conversation_id,),
        ).fetchone()
        if not conv_row:
            logger.warning(f"Rename failed: conversation {conversation_id} not found in database")
            raise HTTPException(status_code=404, detail="Conversation not found")

        # Then check session ownership
        if conv_row["session_id"] != session_id:
            logger.warning(
                f"Rename failed: conversation {conversation_id} owned by session "
                f"{conv_row['session_id']}, requested by session {session_id}"
            )
            raise HTTPException(
                status_code=403,
                detail="Access denied: conversation belongs to another session",
            )

        conn.execute(
            """
            UPDATE conversations
            SET title = ?, updated_at = ?
            WHERE id = ?
            """,
            (payload.title, now_iso(), conversation_id),
        )
        conn.commit()

        row = conn.execute(
            """
            SELECT id, session_id, title, created_at, updated_at
            FROM conversations
            WHERE id = ?
            """,
            (conversation_id,),
        ).fetchone()
        return ConversationResponse(
            id=row["id"],
            session_id=row["session_id"],
            title=row["title"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to rename conversation: %s", exc)
        raise HTTPException(status_code=500, detail="Could not rename conversation")
    finally:
        conn.close()


@app.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, session_id: str):
    """Delete a conversation and all its messages (session ownership verified)."""
    conn = get_db()
    try:
        # First check if the conversation exists at all
        conv_row = conn.execute(
            "SELECT id, session_id FROM conversations WHERE id = ?",
            (conversation_id,),
        ).fetchone()
        if not conv_row:
            logger.warning(f"Delete failed: conversation {conversation_id} not found in database")
            raise HTTPException(status_code=404, detail="Conversation not found")

        # Then check session ownership
        if conv_row["session_id"] != session_id:
            logger.warning(
                f"Delete failed: conversation {conversation_id} owned by session "
                f"{conv_row['session_id']}, requested by session {session_id}"
            )
            raise HTTPException(
                status_code=403,
                detail="Access denied: conversation belongs to another session",
            )

        # Delete the conversation (messages cascade via ON DELETE CASCADE)
        cursor = conn.execute(
            "DELETE FROM conversations WHERE id = ?",
            (conversation_id,),
        )
        deleted_rows = cursor.rowcount
        conn.commit()

        if deleted_rows == 0:
            logger.warning(f"Delete failed: zero rows deleted for conversation {conversation_id}")
            raise HTTPException(status_code=404, detail="Conversation not found")

        logger.info(
            f"Deleted conversation {conversation_id} ({deleted_rows} row(s)) "
            f"and associated messages for session {session_id}"
        )
        return {"status": "deleted", "id": conversation_id}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Failed to delete conversation {conversation_id}: {exc}")
        raise HTTPException(status_code=500, detail="Could not delete conversation")
    finally:
        conn.close()


# =====================================================================
# STREAMING CHAT ENDPOINT
# =====================================================================

@app.post("/chat")
async def chat_endpoint(request: ChatRequest):
    """
    Stream NVIDIA Nemotron 3 Ultra responses as Server-Sent Events.
    Persists user and assistant messages to SQLite conversation store.
    """
    # Custom response for specific query
    normalized = request.message.strip().lower()
    if "does god exist" in normalized:
        def custom_gen():
            yield f"data: {json.dumps({'chunk': 'The one who created me is Akshay, So yes God exists!'})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(custom_gen(), media_type="text/event-stream")

    if not NVIDIA_API_KEY:
        logger.error("NVIDIA_API_KEY missing")
        return StreamingResponse(
            iter([f"data: {json.dumps({'error': 'NVIDIA_API_KEY not configured'})}\n\n"]),
            media_type="text/event-stream",
        )

    # Resolve session and conversation
    session_id = request.session_id or str(uuid.uuid4())
    conversation_id = request.conversation_id

    conn = get_db()
    try:
        if conversation_id:
            # Verify the conversation belongs to this session
            if not verify_conversation_ownership(conn, conversation_id, session_id):
                raise HTTPException(
                    status_code=403,
                    detail="Conversation not found or access denied",
                )
        else:
            # Create a new conversation with auto-generated title
            conv_id = str(uuid.uuid4())
            created = now_iso()
            title = generate_title(request.message)
            conn.execute(
                """
                INSERT INTO conversations (id, session_id, title, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (conv_id, session_id, title, created, created),
            )
            conn.commit()
            conversation_id = conv_id

        # Save the user's message before streaming
        user_msg_id = str(uuid.uuid4())
        created = now_iso()
        conn.execute(
            """
            INSERT INTO messages (id, conversation_id, role, content, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (user_msg_id, conversation_id, "user", request.message, created),
        )
        conn.execute(
            """
            UPDATE conversations
            SET updated_at = ?
            WHERE id = ?
            """,
            (created, conversation_id),
        )
        conn.commit()
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to prepare conversation: %s", exc)
        raise HTTPException(status_code=500, detail="Could not prepare conversation")
    finally:
        conn.close()

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
        full_response = ""
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
                                full_response += content
                                yield f"data: {json.dumps({'chunk': content})}\n\n"
                    except json.JSONDecodeError:
                        pass
            yield "data: [DONE]\n\n"
        finally:
            # Persist the assistant response after streaming completes
            try:
                if full_response.strip():
                    db_conn = get_db()
                    try:
                        asst_msg_id = str(uuid.uuid4())
                        created = now_iso()
                        db_conn.execute(
                            """
                            INSERT INTO messages (id, conversation_id, role, content, created_at)
                            VALUES (?, ?, ?, ?, ?)
                            """,
                            (asst_msg_id, conversation_id, "assistant", full_response, created),
                        )
                        db_conn.execute(
                            """
                            UPDATE conversations
                            SET updated_at = ?
                            WHERE id = ?
                            """,
                            (created, conversation_id),
                        )
                        db_conn.commit()
                    finally:
                        db_conn.close()
            except Exception as exc:
                logger.error("Failed to save assistant response: %s", exc)
            try:
                resp.close()
            except Exception:
                pass

    return StreamingResponse(stream_generator(), media_type="text/event-stream")
