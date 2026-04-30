from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any

from fastapi import WebSocket


class RealtimeAlertHub:
    def __init__(self) -> None:
        self._connections: dict[int, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, user_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections[user_id].add(websocket)
        await websocket.send_json({"type": "connected", "channel": "notifications"})

    async def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        async with self._lock:
            user_connections = self._connections.get(user_id)
            if not user_connections:
                return
            user_connections.discard(websocket)
            if not user_connections:
                self._connections.pop(user_id, None)

    async def notify_user(self, user_id: int, payload: dict[str, Any]) -> int:
        async with self._lock:
            connections = list(self._connections.get(user_id, set()))

        sent = 0
        stale_connections: list[WebSocket] = []
        for websocket in connections:
            try:
                await websocket.send_json(payload)
                sent += 1
            except Exception:
                stale_connections.append(websocket)

        if stale_connections:
            async with self._lock:
                user_connections = self._connections.get(user_id)
                if user_connections:
                    for websocket in stale_connections:
                        user_connections.discard(websocket)
                    if not user_connections:
                        self._connections.pop(user_id, None)

        return sent


realtime_alert_hub = RealtimeAlertHub()
