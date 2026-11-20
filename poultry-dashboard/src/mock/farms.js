export const mockFarms = [
    {
        id: "FARM-01",
        name: "Alpha Valley Operations",
        location: "Sector 4 North",
        houseCount: 6,
        riskLevel: "ok",
        activeAlerts: 0,
        metrics: { temp: 28.4, humidity: 62.1, ammonia: 12.5 }
    },
    {
        id: "FARM-02",
        name: "Beta Ridge Complex",
        location: "Sector 7 East",
        houseCount: 4,
        riskLevel: "warn",
        activeAlerts: 2,
        metrics: { temp: 31.2, humidity: 58.4, ammonia: 18.2 }
    },
    {
        id: "FARM-03",
        name: "Gamma Plains Extension",
        location: "Sector 2 West",
        houseCount: 8,
        riskLevel: "danger",
        activeAlerts: 5,
        metrics: { temp: 33.8, humidity: 75.0, ammonia: 26.5 }
    },
    {
        id: "FARM-04",
        name: "Delta River Facility",
        location: "Sector 9 South",
        houseCount: 5,
        riskLevel: "ok",
        activeAlerts: 0,
        metrics: { temp: 27.9, humidity: 65.2, ammonia: 10.1 }
    }
];

export const mockHouses = {
    "FARM-01": [
        { id: "HSE-A1", name: "House A1", metrics: { temp: 28.1, humidity: 61, ammonia: 11 }, alerts: 0, risk: 'ok', occupancy: 24500, equipment: { fan: 'ok', heat: 'off', feed: 'ok', light: 'ok' } },
        { id: "HSE-A2", name: "House A2", metrics: { temp: 28.5, humidity: 63, ammonia: 13 }, alerts: 0, risk: 'ok', occupancy: 24200, equipment: { fan: 'ok', heat: 'off', feed: 'warn', light: 'ok' } },
    ],
    "FARM-02": [
        { id: "HSE-B1", name: "House B1", metrics: { temp: 32.1, humidity: 55, ammonia: 19 }, alerts: 1, risk: 'warn', occupancy: 18000, equipment: { fan: 'warn', heat: 'off', feed: 'ok', light: 'ok' } },
        { id: "HSE-B2", name: "House B2", metrics: { temp: 30.5, humidity: 60, ammonia: 17 }, alerts: 1, risk: 'warn', occupancy: 18500, equipment: { fan: 'ok', heat: 'off', feed: 'ok', light: 'ok' } },
    ]
};
