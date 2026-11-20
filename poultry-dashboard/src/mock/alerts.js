export const mockAlerts = [
    {
        id: "ALT-1001",
        farmId: "FARM-02",
        houseId: "HSE-B1",
        deviceId: "DEV-003",
        metric: "Ammonia",
        value: "24.1ppm",
        threshold: "20ppm",
        severity: "danger",
        status: "active",
        raisedAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(), // 15 mins ago
        message: "NH3 level exceeded critical threshold."
    },
    {
        id: "ALT-1002",
        farmId: "FARM-03",
        houseId: "HSE-C4",
        deviceId: "DEV-014",
        metric: "Temperature",
        value: "33.8°C",
        threshold: "32.0°C",
        severity: "warn",
        status: "active",
        raisedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(), // 45 mins ago
        message: "High temperature detected in Sector 3."
    },
    {
        id: "ALT-1003",
        farmId: "FARM-01",
        houseId: "HSE-A2",
        deviceId: "SYS-001",
        metric: "Connectivity",
        value: "OFFLINE",
        threshold: "ONLINE",
        severity: "danger",
        status: "acknowledged",
        raisedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hrs ago
        message: "Gateway controller offline."
    }
];
