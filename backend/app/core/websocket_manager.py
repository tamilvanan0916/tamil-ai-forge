import asyncio
import json
import logging
from collections import defaultdict
from typing import Dict, Set, Any
from fastapi import WebSocket

logger = logging.getLogger("tamil_ai_forge.websocket")

class ProjectConnectionManager:
    def __init__(self):
        # project_id -> set of connected WebSockets
        self.active_connections: Dict[str, Set[WebSocket]] = defaultdict(set)
        # global connections (e.g. app-level notifications, render queue)
        self.global_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket, project_id: str = "global"):
        await websocket.accept()
        if project_id == "global":
            self.global_connections.add(websocket)
        else:
            self.active_connections[project_id].add(websocket)
        logger.info(f"WebSocket client connected to channel: {project_id}")

    def disconnect(self, websocket: WebSocket, project_id: str = "global"):
        if project_id == "global":
            self.global_connections.discard(websocket)
        else:
            self.active_connections[project_id].discard(websocket)
            if not self.active_connections[project_id]:
                del self.active_connections[project_id]
        logger.info(f"WebSocket client disconnected from channel: {project_id}")

    async def broadcast_to_project(self, project_id: str, message: Dict[str, Any]):
        """Broadcasts event payload to all clients connected to this project."""
        targets = set(self.active_connections.get(project_id, set())) | self.global_connections
        dead_connections = set()

        for conn in targets:
            try:
                await conn.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send to websocket: {e}")
                dead_connections.add(conn)

        for dead in dead_connections:
            if project_id in self.active_connections:
                self.active_connections[project_id].discard(dead)
            self.global_connections.discard(dead)

    async def broadcast_global(self, message: Dict[str, Any]):
        """Broadcasts event to all active clients across all projects."""
        all_connections = set(self.global_connections)
        for conns in self.active_connections.values():
            all_connections |= conns

        for conn in all_connections:
            try:
                await conn.send_json(message)
            except Exception:
                pass

ws_manager = ProjectConnectionManager()
