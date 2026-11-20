import { useState, useEffect, useCallback } from 'react';
import { useWSSubscribe } from '../context/WSContext';
import { api } from '../lib/Api';

export function useAIActions(houseId = null) {
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const fetcher = houseId ? api.getAIActions(houseId) : api.getAllAIActions();
    
    fetcher
      .then(setActions)
      .catch((e) => console.error("Failed to fetch AI actions", e))
      .finally(() => setLoading(false));
  }, [houseId]);

  useWSSubscribe('ai_action', useCallback((msg) => {
    if (houseId && msg.house_id !== houseId) return;
    setActions(prev => [msg, ...prev].slice(0, 200));
  }, [houseId]));

  return { actions, loading };
}
