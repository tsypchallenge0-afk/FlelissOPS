function FarmMap({ telemetry }) {

  const getStatusColor = (t) => {

    if (!t) return "gray";

    if (t.temperature > 35) return "red";
    if (t.ammonia > 20) return "orange";

    return "green";
  };

  const devices = {};

  telemetry.forEach(t => {
    devices[t.device_id] = t;
  });

  return (

    <div style={{ marginBottom: "40px" }}>

      <h2>Farm Layout</h2>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 200px)",
        gap: "20px"
      }}>

        {Object.keys(devices).map(id => {

          const t = devices[id];

          return (

            <div
              key={id}
              style={{
                border: "2px solid #444",
                padding: "15px",
                borderRadius: "8px",
                background: "#1e1e1e"
              }}
            >

              <h4>Device</h4>

              <p>{id}</p>

              <div
                style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  background: getStatusColor(t)
                }}
              />

              <p>Temp: {t.temperature}</p>
              <p>Humidity: {t.humidity}</p>
              <p>Ammonia: {t.ammonia}</p>

            </div>

          );

        })}

      </div>

    </div>

  );

}

export default FarmMap;