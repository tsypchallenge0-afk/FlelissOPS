import logging

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:

    def __init__(self):
        self.active_connections = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info("WebSocket client connected (%d open)", len(self.active_connections))

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info("WebSocket client disconnected (%d open)", len(self.active_connections))

    async def broadcast(self, message: dict):
        # Iterate over a copy: a closed tab must not stop delivery to the other clients
        # or make the caller (telemetry ingest, AI loop) fail.
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(connection)


manager = ConnectionManager()
