import { useEffect, useState } from 'react';
import { api } from '../lib/Api';
import './Farms.css';

export default function Farms() {
  const [farms, setFarms] = useState([]);
  const [houses, setHouses] = useState([]);
  const [selectedFarmId, setSelectedFarmId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getFarms()
      .then((farmList) => {
        setFarms(farmList);
        if (farmList.length) {
          setSelectedFarmId((prev) => prev ?? farmList[0].id);
        }
      })
      .catch(() => setError('Unable to load farms'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedFarmId) {
      const timer = setTimeout(() => setHouses([]), 0);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      api.getFarmHouses(selectedFarmId)
        .then((houseList) => setHouses(houseList))
        .catch(() => setHouses([]));
    }, 0);
    return () => clearTimeout(timer);
  }, [selectedFarmId]);

  const visibleHouses = houses;

  return (
    <div className="farms-page page-enter">
      <div className="page-header">
        <div>
          <h1 className="page-title condensed">Farms directory</h1>
          <div className="section-label">Select a farm · view associated houses</div>
        </div>
      </div>

      {loading ? (
        <div className="farms-placeholder mono">Loading farms and houses...</div>
      ) : error ? (
        <div className="farms-placeholder mono error">{error}</div>
      ) : (
        <div className="farms-layout stagger">
          <div className="farms-list panel">
            <div className="section-label" style={{ marginBottom: 8 }}>Farms</div>
            {farms.length === 0 ? (
              <div className="farms-placeholder mono">No farms registered yet</div>
            ) : (
              <ul className="farms-items">
                {farms.map(f => (
                  <li
                    key={f.id}
                    className={`farm-item mono ${selectedFarmId === f.id ? 'active' : ''}`}
                    onClick={() => setSelectedFarmId(f.id)}
                  >
                    <div className="farm-name condensed">{f.name}</div>
                    <div className="farm-meta">
                      <span>{f.location}</span>
                      <span className="farm-id">ID: {f.id}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="houses-list panel">
            <div className="section-label" style={{ marginBottom: 8 }}>
              HOUSES {selectedFarmId ? `· FARM ${selectedFarmId}` : ''}
            </div>
            {visibleHouses.length === 0 ? (
              <div className="farms-placeholder mono">No houses for selected farm</div>
            ) : (
              <table className="houses-table">
                <thead>
                  <tr>
                    <th className="section-label">House</th>
                    <th className="section-label">Capacity</th>
                    <th className="section-label">Farm ID</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleHouses.map(h => (
                    <tr key={h.id}>
                      <td className="condensed">{h.name}</td>
                      <td className="mono">{h.capacity}</td>
                      <td className="mono dim">{h.farm_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

