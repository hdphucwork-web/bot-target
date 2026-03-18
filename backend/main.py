"""
FastAPI backend for Target Bot.
Handles task CRUD, proxy management, settings, WebSocket logs,
and orchestrates Playwright workers.

IMPORTANT: Launch via `python run.py` (not `uvicorn main:app` directly).
"""

import sys
import asyncio
import uuid
from datetime import datetime
from typing import Dict, Optional
from contextlib import asynccontextmanager

# ── Windows ProactorEventLoop fix ──────────────────────────────────
# This runs when Uvicorn's reload-worker imports this module in a
# NEW child process.  We must set the policy here as well, AND patch
# Uvicorn's asyncio_setup so it doesn't override us back to Selector.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    import uvicorn.loops.asyncio as _uvicorn_asyncio_loop

    def _noop_asyncio_setup(use_subprocess: bool = False) -> None:
        pass  # prevent Uvicorn from setting SelectorEventLoopPolicy

    _uvicorn_asyncio_loop.asyncio_setup = _noop_asyncio_setup
# ───────────────────────────────────────────────────────────────────

import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import (
    GlobalSettings,
    ProxyEntry,
    TaskConfig,
    CustomerInfo,
    CreditCardInfo,
    load_json,
    save_json,
    ensure_data_dir,
    CONFIG_FILE,
    TASKS_FILE,
    PROXIES_FILE,
)
from worker import AutoWorker
from discord_hook import send_discord_webhook


# ── In-memory state ────────────────────────────────────────────────

settings = GlobalSettings()
tasks: Dict[str, TaskConfig] = {}
proxies: Dict[str, ProxyEntry] = {}
workers: Dict[str, AutoWorker] = {}
async_tasks: Dict[str, asyncio.Task] = {}  # asyncio.Task handles for cancellation
ws_connections: list[WebSocket] = []


# ── Persistence helpers ────────────────────────────────────────────

def persist_settings():
    save_json(CONFIG_FILE, settings.model_dump())


def persist_tasks():
    save_json(TASKS_FILE, {tid: t.model_dump() for tid, t in tasks.items()})


def persist_proxies():
    save_json(PROXIES_FILE, {pid: p.model_dump() for pid, p in proxies.items()})


def load_state():
    global settings
    ensure_data_dir()

    cfg = load_json(CONFIG_FILE, {})
    if cfg:
        settings = GlobalSettings(**cfg)

    raw_tasks = load_json(TASKS_FILE, {})
    for tid, tdata in raw_tasks.items():
        # Reset running tasks to idle on startup
        if tdata.get("status") in ("running", "paused"):
            tdata["status"] = "idle"
        tasks[tid] = TaskConfig(**tdata)

    raw_proxies = load_json(PROXIES_FILE, {})
    for pid, pdata in raw_proxies.items():
        proxies[pid] = ProxyEntry(**pdata)


# ── WebSocket broadcast ────────────────────────────────────────────

async def broadcast_log(task_id: str, level: str, message: str):
    """Send log to all connected WebSocket clients."""
    task_status = ""
    if task_id in tasks:
        task_status = tasks[task_id].status
        tasks[task_id].last_log = message
        persist_tasks()

    payload = {
        "type": "log",
        "task_id": task_id,
        "level": level,
        "message": message,
        "timestamp": datetime.now().strftime("%H:%M:%S"),
        "status": task_status,
    }

    dead = []
    for ws in ws_connections:
        try:
            await ws.send_json(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        ws_connections.remove(ws)


async def broadcast_task_update(task_id: str):
    """Notify UI of task status change."""
    if task_id not in tasks:
        return
    payload = {
        "type": "task_update",
        "task": tasks[task_id].model_dump(),
    }
    dead = []
    for ws in ws_connections:
        try:
            await ws.send_json(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        ws_connections.remove(ws)


# ── Task runner ─────────────────────────────────────────────────────

async def run_task(task_id: str):
    """Run a task's automation worker."""
    task = tasks.get(task_id)
    if not task:
        return

    proxy = proxies.get(task.proxy_id) if task.proxy_id else None

    worker = AutoWorker(task, settings, proxy, broadcast_log)
    workers[task_id] = worker

    task.status = "running"
    persist_tasks()
    await broadcast_task_update(task_id)

    try:
        await worker.run()
        task.status = "success"
        # Send Discord webhook on success
        if settings.discord_webhook_url:
            await send_discord_webhook(settings.discord_webhook_url, task)
    except asyncio.CancelledError:
        task.status = "idle"
    except Exception:
        task.status = "error"
    finally:
        workers.pop(task_id, None)
        async_tasks.pop(task_id, None)
        persist_tasks()
        await broadcast_task_update(task_id)


# ── App lifecycle ───────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    load_state()
    yield
    # Cleanup: cancel all running workers
    for worker in workers.values():
        worker.cancel()
    for at in async_tasks.values():
        if not at.done():
            at.cancel()


app = FastAPI(title="Target Bot API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ══════════════════════════════════════════════════════════════════════
#  WEBSOCKET
# ══════════════════════════════════════════════════════════════════════

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    ws_connections.append(ws)
    try:
        while True:
            await ws.receive_text()  # Keep alive
    except WebSocketDisconnect:
        if ws in ws_connections:
            ws_connections.remove(ws)


# ══════════════════════════════════════════════════════════════════════
#  SETTINGS
# ══════════════════════════════════════════════════════════════════════

@app.get("/api/settings")
async def get_settings():
    return settings.model_dump()


class SettingsUpdate(BaseModel):
    headless: Optional[bool] = None
    retry_limit: Optional[int] = None
    discord_webhook_url: Optional[str] = None


@app.put("/api/settings")
async def update_settings(body: SettingsUpdate):
    if body.headless is not None:
        settings.headless = body.headless
    if body.retry_limit is not None:
        settings.retry_limit = body.retry_limit
    if body.discord_webhook_url is not None:
        settings.discord_webhook_url = body.discord_webhook_url
    persist_settings()
    return settings.model_dump()


# ══════════════════════════════════════════════════════════════════════
#  TASKS
# ══════════════════════════════════════════════════════════════════════

class TaskCreateRequest(BaseModel):
    task_name: str = ""
    product_url: str = ""
    quantity: int = 1
    customer: CustomerInfo = CustomerInfo()
    credit_card: CreditCardInfo = CreditCardInfo()
    proxy_id: Optional[str] = None
    reload_delay_ms: int = 3000


@app.get("/api/tasks")
async def list_tasks():
    return [t.model_dump() for t in tasks.values()]


@app.post("/api/tasks")
async def create_task(body: TaskCreateRequest):
    tid = str(uuid.uuid4())[:8]
    task = TaskConfig(
        id=tid,
        task_name=body.task_name,
        product_url=body.product_url,
        quantity=body.quantity,
        customer=body.customer,
        credit_card=body.credit_card,
        proxy_id=body.proxy_id,
        reload_delay_ms=body.reload_delay_ms,
    )
    tasks[tid] = task
    persist_tasks()
    return task.model_dump()


@app.put("/api/tasks/{task_id}")
async def update_task(task_id: str, body: TaskCreateRequest):
    if task_id not in tasks:
        raise HTTPException(404, "Task not found")
    task = tasks[task_id]
    if task.status == "running":
        raise HTTPException(400, "Cannot edit a running task")
    task.task_name = body.task_name
    task.product_url = body.product_url
    task.quantity = body.quantity
    task.customer = body.customer
    task.credit_card = body.credit_card
    task.proxy_id = body.proxy_id
    task.reload_delay_ms = body.reload_delay_ms
    persist_tasks()
    return task.model_dump()


@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: str):
    if task_id not in tasks:
        raise HTTPException(404, "Task not found")
    # Cancel if running
    if task_id in workers:
        workers[task_id].cancel()
    tasks.pop(task_id)
    persist_tasks()
    return {"ok": True}


# ── Task actions ────────────────────────────────────────────────────

@app.post("/api/tasks/{task_id}/start")
async def start_task(task_id: str):
    if task_id not in tasks:
        raise HTTPException(404, "Task not found")
    task = tasks[task_id]
    if task.status == "running":
        raise HTTPException(400, "Task is already running")
    at = asyncio.create_task(run_task(task_id))
    async_tasks[task_id] = at
    return {"ok": True, "status": "running"}


@app.post("/api/tasks/{task_id}/stop")
async def stop_task(task_id: str):
    if task_id not in tasks:
        raise HTTPException(404, "Task not found")
    worker = workers.get(task_id)
    if worker:
        worker.cancel()
    at = async_tasks.get(task_id)
    if at and not at.done():
        at.cancel()
    tasks[task_id].status = "idle"
    persist_tasks()
    await broadcast_task_update(task_id)
    return {"ok": True, "status": "idle"}


@app.post("/api/tasks/{task_id}/pause")
async def pause_task(task_id: str):
    if task_id not in tasks:
        raise HTTPException(404, "Task not found")
    worker = workers.get(task_id)
    if worker:
        worker.pause()
    tasks[task_id].status = "paused"
    persist_tasks()
    await broadcast_task_update(task_id)
    return {"ok": True, "status": "paused"}


@app.post("/api/tasks/{task_id}/resume")
async def resume_task(task_id: str):
    if task_id not in tasks:
        raise HTTPException(404, "Task not found")
    worker = workers.get(task_id)
    if worker:
        worker.resume()
    tasks[task_id].status = "running"
    persist_tasks()
    await broadcast_task_update(task_id)
    return {"ok": True, "status": "running"}


# ── Bulk actions ────────────────────────────────────────────────────

@app.post("/api/tasks/start-all")
async def start_all_tasks():
    count = 0
    for tid, task in tasks.items():
        if task.status in ("idle", "error", "success"):
            at = asyncio.create_task(run_task(tid))
            async_tasks[tid] = at
            count += 1
    return {"ok": True, "started": count}


@app.post("/api/tasks/stop-all")
async def stop_all_tasks():
    count = 0
    for tid, worker in list(workers.items()):
        worker.cancel()
        at = async_tasks.get(tid)
        if at and not at.done():
            at.cancel()
        if tid in tasks:
            tasks[tid].status = "idle"
        count += 1
    persist_tasks()
    return {"ok": True, "stopped": count}


# ══════════════════════════════════════════════════════════════════════
#  PROXIES
# ══════════════════════════════════════════════════════════════════════

class ProxyCreateRequest(BaseModel):
    raw: str  # IP:Port:User:Pass or IP:Port


@app.get("/api/proxies")
async def list_proxies():
    return [p.model_dump() for p in proxies.values()]


@app.post("/api/proxies")
async def add_proxy(body: ProxyCreateRequest):
    parts = body.raw.strip().split(":")
    if len(parts) < 2:
        raise HTTPException(400, "Invalid proxy format. Use IP:Port or IP:Port:User:Pass")

    pid = str(uuid.uuid4())[:8]
    proxy = ProxyEntry(
        id=pid,
        host=parts[0],
        port=int(parts[1]),
        username=parts[2] if len(parts) > 2 else "",
        password=parts[3] if len(parts) > 3 else "",
    )
    proxies[pid] = proxy
    persist_proxies()
    return proxy.model_dump()


@app.post("/api/proxies/bulk")
async def add_proxies_bulk(body: dict):
    """Add multiple proxies at once. Body: { "proxies": ["ip:port:user:pass", ...] }"""
    raw_list = body.get("proxies", [])
    added = []
    for raw in raw_list:
        parts = raw.strip().split(":")
        if len(parts) < 2:
            continue
        pid = str(uuid.uuid4())[:8]
        proxy = ProxyEntry(
            id=pid,
            host=parts[0],
            port=int(parts[1]),
            username=parts[2] if len(parts) > 2 else "",
            password=parts[3] if len(parts) > 3 else "",
        )
        proxies[pid] = proxy
        added.append(proxy.model_dump())
    persist_proxies()
    return added


@app.delete("/api/proxies/{proxy_id}")
async def delete_proxy(proxy_id: str):
    if proxy_id not in proxies:
        raise HTTPException(404, "Proxy not found")
    proxies.pop(proxy_id)
    persist_proxies()
    return {"ok": True}


@app.post("/api/proxies/{proxy_id}/test")
async def test_proxy(proxy_id: str):
    """Test a proxy by connecting to target.co.jp through it."""
    if proxy_id not in proxies:
        raise HTTPException(404, "Proxy not found")

    proxy = proxies[proxy_id]
    proxy_url = proxy.server_url
    if proxy.username:
        proxy_url = f"http://{proxy.username}:{proxy.password}@{proxy.host}:{proxy.port}"

    try:
        async with httpx.AsyncClient(
            proxy=proxy_url,
            timeout=15,
        ) as client:
            resp = await client.get("https://www.target.co.jp/", follow_redirects=True)
            if resp.status_code < 500:
                proxy.status = "alive"
            else:
                proxy.status = "dead"
    except Exception:
        proxy.status = "dead"

    persist_proxies()
    return proxy.model_dump()


@app.post("/api/proxies/test-all")
async def test_all_proxies():
    """Test all proxies concurrently."""
    async def _test(pid):
        try:
            await test_proxy(pid)
        except Exception:
            pass

    await asyncio.gather(*[_test(pid) for pid in proxies])
    return [p.model_dump() for p in proxies.values()]


# ══════════════════════════════════════════════════════════════════════
#  HEALTH
# ══════════════════════════════════════════════════════════════════════

@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "tasks": len(tasks),
        "running": sum(1 for t in tasks.values() if t.status == "running"),
        "proxies": len(proxies),
    }
