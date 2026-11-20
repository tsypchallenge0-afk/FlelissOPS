import { useState, useEffect, useCallback, useRef } from 'react';
import { useWSSubscribe } from '../context/WSContext';
import { api } from '../lib/Api';

/**
 * Fetches AI predictions for a house and keeps them live.
 *
 * Returns:
 *   predictions  — full prediction object from GET /ai/predictions/:houseId
 *   anomalies    — array of detected anomalies (live-updated via WS)
 *   coverage     — data coverage stats from GET /ai/coverage/:houseId
 *   loading      — true while initial fetch is in progress
 *   error        — error object if fetch failed
 *   refresh      — function to manually re-fetch
 *   wsActive     — true if WebSocket prediction messages are arriving
 */
export function usePredictions(houseId) {
  const [predictions, setPredictions] = useState(null);
  const [anomalies,   setAnomalies]   = useState([]);
  const [coverage,    setCoverage]    = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [wsActive,    setWsActive]    = useState(false);
  const wsTimeoutRef = useRef(null);

  // Initial fetch
  const refresh = useCallback(() => {
    if (!houseId) return;
    setLoading(true);
    setError(null);

    Promise.all([
      api.getPredictions(houseId),
      api.getAICoverage(houseId),
    ])
      .then(([pred, cov]) => {
        setPredictions(pred);
        // Seed anomalies from initial fetch
        setAnomalies(pred?.anomalies ?? []);
        setCoverage(cov);
      })
      .catch(err => {
        setError(err);
        // Don't crash — show degraded state
      })
      .finally(() => setLoading(false));
  }, [houseId]);

  useEffect(() => {
     
    refresh();
  }, [refresh]);

  // Poll every 60s as fallback if WebSocket is not delivering prediction messages
  useEffect(() => {
    if (!houseId) return;
    const interval = setInterval(() => {
      if (!wsActive) refresh();   // only poll if WS isn't delivering
    }, 60000);
    return () => clearInterval(interval);
  }, [houseId, wsActive, refresh]);

  // Live prediction updates via WebSocket
  useWSSubscribe('prediction', useCallback((msg) => {
    if (msg.house_id !== houseId) return;
    setPredictions(msg);

    // Mark WS as active — suppress polling
    setWsActive(true);
    clearTimeout(wsTimeoutRef.current);
    // If no WS message for 90s, fall back to polling
    wsTimeoutRef.current = setTimeout(() => setWsActive(false), 90000);
  }, [houseId]));

  // Live anomaly updates via WebSocket
  useWSSubscribe('anomaly', useCallback((msg) => {
    if (msg.house_id !== houseId) return;
    setAnomalies(prev => {
      // Deduplicate by timestamp
      const exists = prev.some(a => a.timestamp === msg.timestamp);
      if (exists) return prev;
      // Keep last 50 anomalies, most recent first
      return [msg, ...prev].slice(0, 50);
    });
  }, [houseId]));

  // Cleanup
  useEffect(() => {
    return () => clearTimeout(wsTimeoutRef.current);
  }, []);

  return {
    predictions,
    anomalies,
    coverage,
    loading,
    error,
    refresh,
    wsActive,
  };
}

/**
 * Simplified version of usePredictions for the Dashboard KPI cards.
 */
export function usePredictionSummary(houseId) {
  const { predictions } = usePredictions(houseId);

  return {
    summary: predictions?.predictions || {},
    riskLevel: predictions?.risk_level || 'NORMAL',
  };
}
