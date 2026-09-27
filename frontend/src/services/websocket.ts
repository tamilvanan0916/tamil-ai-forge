import { API_BASE_URL } from './api';

export type WebSocketListener = (data: any) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private currentProjectId: string | null = null;
  private listeners: Set<WebSocketListener> = new Set();
  private reconnectTimeout: any = null;

  connect(projectId: string = 'global') {
    if (this.ws && this.currentProjectId === projectId) {
      return;
    }

    this.disconnect();
    this.currentProjectId = projectId;

    const wsUrl = API_BASE_URL.replace(/^http/, 'ws') + `/ws/projects/${projectId}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log(`[TAMIL AI FORGE WS] Connected to project channel: ${projectId}`);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.listeners.forEach((fn) => fn(data));
        } catch (e) {
          // ignore non-json messages
        }
      };

      this.ws.onclose = () => {
        console.log('[TAMIL AI FORGE WS] Connection closed, scheduling reconnect...');
        this.reconnectTimeout = setTimeout(() => {
          if (this.currentProjectId) {
            this.connect(this.currentProjectId);
          }
        }, 3000);
      };

      this.ws.onerror = (err) => {
        console.warn('[TAMIL AI FORGE WS] Connection error', err);
      };
    } catch (e) {
      console.warn('[TAMIL AI FORGE WS] Failed to create socket', e);
    }
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  subscribe(listener: WebSocketListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  send(data: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }
}

export const wsClient = new WebSocketClient();
