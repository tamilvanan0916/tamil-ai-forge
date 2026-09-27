from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.core.websocket_manager import ws_manager

router = APIRouter(tags=["websocket"])

@router.websocket("/ws/projects/{project_id}")
async def project_websocket(websocket: WebSocket, project_id: str):
    """
    Project-scoped WebSocket connection for real-time notifications:
    - Render progress and completion
    - AI job generation progress
    - Asset processing (proxy, thumbnail, waveform) completion
    - Project autosave broadcasts
    """
    await ws_manager.connect(websocket, project_id)
    try:
        while True:
            # Handle client heartbeat pings
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, project_id)
    except Exception:
        ws_manager.disconnect(websocket, project_id)

@router.websocket("/ws/global")
async def global_websocket(websocket: WebSocket):
    """App-level WebSocket connection."""
    await ws_manager.connect(websocket, "global")
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, "global")
    except Exception:
        ws_manager.disconnect(websocket, "global")
