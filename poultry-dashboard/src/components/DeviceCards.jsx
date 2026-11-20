function DeviceCards({ telemetry }) {

  const devices = {};

  telemetry.forEach((t) => {
    if (!devices[t.device_id]) {
      devices[t.device_id] = t;
    }
  });

  return (
    <div style={{display:"flex", gap:"20px", marginBottom:"30px"}}>

      {Object.values(devices).map((d, i) => (

        <div
          key={i}
          style={{
            border:"1px solid gray",
            padding:"20px",
            borderRadius:"10px",
            width:"200px"
          }}
        >

          <h3>{d.device_id}</h3>

          <p>🌡 Temp: {d.temperature}</p>

          <p>💧 Humidity: {d.humidity}</p>

          <p>🧪 Ammonia: {d.ammonia}</p>

        </div>

      ))}

    </div>
  );
}

export default DeviceCards;