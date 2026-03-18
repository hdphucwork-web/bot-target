"""
Entry point for the backend server.

WHY this file exists:
    Uvicorn's --reload mode uses subprocesses. When it detects Windows + subprocess,
    it FORCEFULLY sets WindowsSelectorEventLoopPolicy (see uvicorn/loops/asyncio.py).
    SelectorEventLoop cannot create subprocesses, so Playwright's
    asyncio.create_subprocess_exec() raises NotImplementedError.

    The fix: patch Uvicorn's asyncio_setup function so it never overrides our
    ProactorEventLoopPolicy, then set the correct policy ourselves.
"""

import sys
import asyncio

if sys.platform == "win32":
    # 1. Force ProactorEventLoop policy FIRST
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    # 2. Prevent Uvicorn from overriding it back to SelectorEventLoop
    import uvicorn.loops.asyncio

    _original_asyncio_setup = uvicorn.loops.asyncio.asyncio_setup

    def _patched_asyncio_setup(use_subprocess: bool = False) -> None:
        # Do nothing — we already set ProactorEventLoopPolicy above.
        # The original function sets SelectorEventLoopPolicy on Windows
        # when use_subprocess=True, which breaks Playwright.
        pass

    uvicorn.loops.asyncio.asyncio_setup = _patched_asyncio_setup

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
