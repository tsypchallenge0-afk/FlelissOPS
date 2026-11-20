import { useState, useEffect, useCallback } from 'react';
import { useWSSubscribe } from '../context/WSContext';
import { api } from '../lib/Api';

/**
 * Loads sensors and actuators for a house and keeps them live.
 *
 * Returns:
 *   sensors    — array of sensor devices with latest_reading attached
 *   actuators  — array of actuator devices with current_state attached
 *   loading    — true while initial fetch in progress
 *   refresh    — manual refetch function
 */
export function useHouseDevices(houseId) {
  const [sensors,   setSensors]   = useState([]);
  const [actuators, setActuators] = useState([]);
  const [loading,   setLoading]   = useState(true);

  const refresh = useCallback(() => {
    if (!houseId) return;
    setLoading(true);
    Promise.all([
      api.getHouseSensors(houseId),
      api.getHouseActuators(houseId),
    ])
      .then(([s, a]) => { setSensors(s); setActuators(a); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [houseId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Live telemetry — update sensor readings in place
  useWSSubscribe('telemetry', useCallback((msg) => {
    const point = msg.data || msg;
    if (point.house_id !== houseId) return;
    setSensors(prev => prev.map(sensor => {
      const matches =
        sensor.device_id === point.device_id ||
        sensor._id === point.device_id ||
        // If no device_id on msg, update all sensors of matching type
        (point.device_id == null);

      if (!matches) return sensor;
      return {
        ...sensor,
        latest_reading: {
          ...sensor.latest_reading,
          temperature: point.temperature ?? sensor.latest_reading?.temperature,
          humidity:    point.humidity    ?? sensor.latest_reading?.humidity,
          ammonia:     point.ammonia     ?? sensor.latest_reading?.ammonia,
          timestamp:   point.timestamp,
        },
      };
    }));
  }, [houseId]));

  // Live actuator state updates
  useWSSubscribe('control_update', useCallback((msg) => {
    if (msg.house_id !== houseId) return;
    setActuators(prev => prev.map(act => {
      const type = act.device_type?.replace('actuator_', '');
      if (type !== msg.device_type) return act;
      return {
        ...act,
        current_state: {
          ...act.current_state,
          mode:        msg.mode,
          state:       msg.state,
          updated_by:  msg.updated_by,
          updated_at:  msg.timestamp,
        },
      };
    }));
  }, [houseId]));

  return { sensors, actuators, loading, refresh };
}
