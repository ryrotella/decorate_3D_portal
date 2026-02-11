import { useEffect, useRef, useCallback, useState } from 'react';

export interface UseWebSocketOptions {
  url: string;
  /** Auto-reconnect on close/error */
  autoReconnect?: boolean;
  /** Base reconnect delay in ms */
  reconnectDelay?: number;
  /** Max reconnect delay in ms */
  maxReconnectDelay?: number;
  /** Binary message handler */
  onBinaryMessage?: (data: ArrayBuffer) => void;
  /** Text/JSON message handler */
  onTextMessage?: (data: string) => void;
  /** Connection state change handler */
  onStateChange?: (connected: boolean) => void;
}

export interface UseWebSocketReturn {
  connected: boolean;
  send: (data: string | ArrayBuffer) => void;
  sendJson: (data: unknown) => void;
  close: () => void;
  reconnect: () => void;
}

export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const {
    url,
    autoReconnect = true,
    reconnectDelay = 1000,
    maxReconnectDelay = 30000,
    onBinaryMessage,
    onTextMessage,
    onStateChange,
  } = options;

  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalCloseRef = useRef(false);

  // Store callbacks in refs to avoid re-triggering useEffect
  const onBinaryRef = useRef(onBinaryMessage);
  const onTextRef = useRef(onTextMessage);
  const onStateRef = useRef(onStateChange);
  onBinaryRef.current = onBinaryMessage;
  onTextRef.current = onTextMessage;
  onStateRef.current = onStateChange;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // Clean up existing
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      if (wsRef.current.readyState < WebSocket.CLOSING) {
        wsRef.current.close();
      }
    }

    intentionalCloseRef.current = false;

    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      onStateRef.current?.(true);
      reconnectAttemptRef.current = 0;
    };

    ws.onclose = () => {
      setConnected(false);
      onStateRef.current?.(false);

      if (autoReconnect && !intentionalCloseRef.current) {
        const delay = Math.min(
          reconnectDelay * 2 ** reconnectAttemptRef.current,
          maxReconnectDelay
        );
        reconnectAttemptRef.current++;
        reconnectTimerRef.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => {
      // onclose will fire after this
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        onBinaryRef.current?.(event.data);
      } else if (typeof event.data === 'string') {
        onTextRef.current?.(event.data);
      }
    };
  }, [url, autoReconnect, reconnectDelay, maxReconnectDelay]);

  const send = useCallback((data: string | ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  const sendJson = useCallback((data: unknown) => {
    send(JSON.stringify(data));
  }, [send]);

  const close = useCallback(() => {
    intentionalCloseRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
    }
    setConnected(false);
  }, []);

  const reconnect = useCallback(() => {
    close();
    setTimeout(connect, 100);
  }, [close, connect]);

  useEffect(() => {
    connect();
    return () => {
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { connected, send, sendJson, close, reconnect };
}
