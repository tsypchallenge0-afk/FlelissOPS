import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

/* eslint-disable react-refresh/only-export-components */
const WS_URL = 'ws://127.0.0.1:9000/ws';
const WSContext = createContext(null);

export function WSProvider({ children }) {
    const wsRef = useRef(null);
    const listenersRef = useRef({});  // { messageType: [callbacks] }
    const pendingRef = useRef([]);
    const flushTimer = useRef(null);
    const [status, setStatus] = useState('connecting');

    useEffect(() => {
        let isMounted = true;
        let shouldReconnect = true;
        let reconnectTimer = null;

        const connect = () => {
            if (!isMounted || !shouldReconnect) return;
            const ws = new WebSocket(WS_URL);
            wsRef.current = ws;
            ws.onopen = () => { if (isMounted) setStatus('connected'); };
            ws.onclose = () => { 
                if (isMounted && shouldReconnect) {
                    setStatus('reconnecting'); 
                    reconnectTimer = setTimeout(connect, 3000); 
                }
            };
            ws.onerror = () => { if (isMounted) setStatus('error'); };
            ws.onmessage = (e) => {
                try {
                    const msg = JSON.parse(e.data);
                    if (msg.type === 'telemetry') {
                        pendingRef.current.push(msg);
                        if (!flushTimer.current) {
                            flushTimer.current = setTimeout(() => {
                                const batch = pendingRef.current.splice(0);
                                flushTimer.current = null;
                                const latest = Object.fromEntries(
                                    batch.map(m => [m.data?.house_id || m.data?.device_id, m])
                                );
                                Object.values(latest).forEach(m => {
                                    (listenersRef.current['telemetry'] ?? []).forEach(cb => cb(m));
                                });
                            }, 250);
                        }
                        return;
                    }
                    const type = msg.type ?? 'unknown';
                    (listenersRef.current[type] ?? []).forEach(cb => cb(msg));
                    (listenersRef.current['*'] ?? []).forEach(cb => cb(msg));
                } catch {
                    // Ignore malformed websocket payloads from non-JSON heartbeat/noise frames.
                }
            };
        };
        connect();
        return () => {
            isMounted = false;
            shouldReconnect = false;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            if (wsRef.current) {
                const ws = wsRef.current;
                ws.onclose = null; // Prevent reconnect loop on teardown.
                if (ws.readyState === WebSocket.OPEN) {
                    ws.close();
                } else if (ws.readyState === WebSocket.CONNECTING) {
                    // In React strict/dev remounts, defer close until open to avoid noisy
                    // "closed before connection established" browser warnings.
                    ws.onopen = () => ws.close();
                }
            }
        };
    }, []);

    // Pages call useWSSubscribe('telemetry', handler) to receive messages
    const subscribe = useCallback((type, callback) => {
        if (!listenersRef.current[type]) listenersRef.current[type] = [];
        listenersRef.current[type].push(callback);
        return () => {
            listenersRef.current[type] = listenersRef.current[type].filter(cb => cb !== callback);
        };
    }, []);

    return (
        <WSContext.Provider value={{ status, subscribe }}>
            {children}
        </WSContext.Provider>
    );
}

export const useWSSubscribe = (type, callback) => {
    const { subscribe } = useContext(WSContext);
    useEffect(() => subscribe(type, callback), [type, callback, subscribe]);
};

export const useWSStatus = () => useContext(WSContext).status;
