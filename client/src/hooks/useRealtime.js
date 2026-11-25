import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveWsUrl, withToken } from '../utils/realtime.js';

const MAX_ALERTS = 50;
const MAX_POINTS = 120;

export function useRealtime(token) {
  const [status, setStatus] = useState(token ? 'connecting' : 'offline');
  const [alerts, setAlerts] = useState([]);
  const [telemetry, setTelemetry] = useState([]);
  const [ruleStatus, setRuleStatus] = useState(null);
  const [lastError, setLastError] = useState(null);

  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const attemptsRef = useRef(0);

  useEffect(() => {
    if (!token) {
      setStatus('offline');
      return undefined;
    }

    let stopped = false;

    const connect = () => {
      if (stopped) return;
      setStatus(attemptsRef.current === 0 ? 'connecting' : 'reconnecting');

      let socket;
      try {
        socket = new WebSocket(withToken(resolveWsUrl(), token));
      } catch (error) {
        setLastError(error.message);
        setStatus('offline');
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        if (stopped) return;
        attemptsRef.current = 0;
        setStatus('live');
        setLastError(null);
      };

      socket.onmessage = (event) => {
        if (stopped) return;
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }

        if (message.type === 'welcome') {
          if (message.payload?.rule) setRuleStatus(message.payload.rule);
          return;
        }

        if (message.type === 'alert') {
          setAlerts((previous) => [message.payload, ...previous].slice(0, MAX_ALERTS));
          return;
        }

        if (message.type === 'telemetry') {
          const points = Array.isArray(message.payload?.points) ? message.payload.points : [];
          if (points.length > 0) {
            setTelemetry((previous) => [...points.slice(-MAX_POINTS), ...previous].slice(0, MAX_POINTS));
          }
          return;
        }

        if (message.type === 'rule.status') {
          setRuleStatus(message.payload);
        }
      };

      socket.onerror = () => {
        if (!stopped) setLastError('WebSocket connection error');
      };

      socket.onclose = () => {
        socketRef.current = null;
        if (stopped) return;
        setStatus('offline');
        const delay = Math.min(1000 * 2 ** attemptsRef.current, 10000);
        attemptsRef.current += 1;
        reconnectTimerRef.current = setTimeout(connect, delay);
      };
    };

    connect();

    const pingTimer = setInterval(() => {
      const socket = socketRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25000);

    return () => {
      stopped = true;
      clearInterval(pingTimer);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      const socket = socketRef.current;
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
      socketRef.current = null;
    };
  }, [token]);

  const clearAlerts = useCallback(() => setAlerts([]), []);
  const wsUrl = resolveWsUrl();

  return { status, alerts, telemetry, ruleStatus, lastError, clearAlerts, wsUrl };
}
