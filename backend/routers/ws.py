"""
WebSocket endpoint for real-time pipeline progress streaming.
"""

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()
logger = logging.getLogger("ironsite.ws")


@router.websocket("/ws/{run_id}")
async def websocket_endpoint(websocket: WebSocket, run_id: str):
    """Accept a WebSocket connection for *run_id* and keep it alive.

    The server pushes progress events; client messages are read and
    discarded (keep-alive / ping).
    """
    ws_manager = websocket.app.state.ws_manager

    await ws_manager.connect(run_id, websocket)

    try:
        while True:
            # Read and ignore client messages (keeps the connection alive)
            _data = await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(run_id, websocket)
        logger.info("Client disconnected from run %s", run_id)
    except Exception:
        ws_manager.disconnect(run_id, websocket)
