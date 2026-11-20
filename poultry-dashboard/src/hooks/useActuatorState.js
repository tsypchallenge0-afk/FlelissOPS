import { useState, useEffect, useCallback } from 'react';
import { useWSSubscribe } from '../context/WSContext';
import { api } from '../lib/Api';

/**
 * Fetches actuator state for a house and keeps it live via WebSocket.
 * Returns { state, loading, error, refetch }
 * state shape: { fans: {...}, heater: {...}, feeder: {...}, lighting: {...} }
 */
export function useActuatorState(houseId) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch = useCallback(() => {
    if (!houseId) return;
    setLoading(true);
    api.getHouseControls(houseId)
      .then(res => {
        // Convert list [ {_id, device_type, ...} ] to map { [type]: {...} }
        const map = {};
        if (Array.isArray(res)) {
          res.forEach(item => {
            map[item.device_type] = item;
          });
        } else {
          // If already a map, just use it
          Object.assign(map, res);
        }
        setState(map);
      })
      .catch(e => setError(e))
      .finally(() => setLoading(false));
  }, [houseId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  // Live sync — when another user changes something, update locally
  useWSSubscribe('control_update', useCallback((msg) => {
    if (msg.house_id !== houseId) return;
    setState(prev => {
      if (!prev) return prev;
      const type = msg.device_type;
      return {
        ...prev,
        [type]: {
          ...(prev[type] || {}),
          mode: msg.mode,
          state: msg.state, // the broadcast sends "state" as the object
          updated_by: msg.updated_by,
          updated_at: msg.timestamp
        }
      };
    });
  }, [houseId]));

  return { state, loading, error, refetch: fetch };
}
