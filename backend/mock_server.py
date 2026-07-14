"""
Local stand-in for main.py: same routes/event shapes the frontend expects, but no
GitHub/AI calls. Lets you run the full explain -> overview -> chat -> diagram flow
against fake data.

Run:  uvicorn backend.mock_server:app --reload --port 8002
(matches frontend/.env.development's VITE_BACKEND_API_URL out of the box)
"""

import asyncio
import json
from datetime import datetime, timezone

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

STAGES = ["validating", "fetching_tree", "exploring_files", "fetching_files", "generating_explanation"]
STAGE_DELAY_S = 0.8

FAKE_EXPLANATION = """# {repo}

This is a mock explanation from the local test backend — no GitHub or AI API was called.

## Architecture

```mermaid
graph TD
  A[Client request] --> B[Routing layer]
  B --> C[Dependency injection]
  B --> D[Pydantic models]
  C --> E[Response]
  D --> E[Response]
```

## Tech Stack

Whatever you'd like to pretend it is — this text is canned.

## Key Directories

- `src/` — mock source tree.
- `tests/` — mock tests.
"""


def sse(event: str, data) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@app.get("/")
def root():
    return "Welcome to Repo Explainer! (mock backend)"


@app.get("/{owner}/{repo}/stream")
async def stream(owner: str, repo: str, instructions: str | None = None):
    async def gen():
        # "error" as the repo name lets you exercise the error/back-to-home path.
        if repo == "error":
            yield sse("status", {"stage": "validating"})
            await asyncio.sleep(STAGE_DELAY_S)
            yield sse("error", {"detail": f"Repository '{owner}/{repo}' not found (mock error)."})
            return

        for stage in STAGES:
            yield sse("status", {"stage": stage})
            await asyncio.sleep(STAGE_DELAY_S)

        result = {
            "explanation": FAKE_EXPLANATION.format(repo=f"{owner}/{repo}"),
            "repo": f"{owner}/{repo}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "cache": False,
            "default_branch": "main",
        }
        yield sse("result", result)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


@app.websocket("/{owner}/{repo}/chat")
async def chat(websocket: WebSocket, owner: str, repo: str):
    await websocket.accept()
    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)

            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
                continue
            if data.get("type") != "message":
                continue

            content = (data.get("content") or "").strip()
            await websocket.send_json({"type": "status", "stage": "thinking"})
            await asyncio.sleep(0.5)

            reply = f'(mock) You asked "{content}" about {owner}/{repo}. Replies here are canned.'
            for word in reply.split(" "):
                await websocket.send_json({"type": "chunk", "delta": word + " "})
                await asyncio.sleep(0.03)

            await websocket.send_json({"type": "result", "message": reply})
    except WebSocketDisconnect:
        pass
