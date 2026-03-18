import { useEffect, useRef, useCallback, useState } from "react";
import { WS_URL } from "../api";
import type { WSMessage, LogMessage } from "../types";

export function useWebSocket(
  onTaskUpdate: (task: Record<string, unknown>) => void
) {
  const wsRef = useRef<WebSocket | null>(null);
  const onTaskUpdateRef = useRef(onTaskUpdate);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [connected, setConnected] = useState(false);

  // Keep the callback ref up to date without causing reconnects
  useEffect(() => {
    onTaskUpdateRef.current = onTaskUpdate;
  }, [onTaskUpdate]);

  const connect = useCallback(() => {
    // Clean up any existing connection
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
    }

    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data: WSMessage = JSON.parse(event.data);
        if (data.type === "log") {
          setLogs((prev) => [...prev.slice(-500), data]);
        } else if (data.type === "task_update") {
          onTaskUpdateRef.current(data.task as unknown as Record<string, unknown>);
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      setConnected(false);
      // Auto-reconnect after 3s
      reconnectTimerRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, []); // No dependencies — stable forever

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent reconnect on cleanup
        wsRef.current.close();
      }
    };
  }, [connect]);

  const clearLogs = useCallback(() => setLogs([]), []);

  return { logs, connected, clearLogs };
}
