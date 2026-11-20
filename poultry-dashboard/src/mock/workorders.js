export const mockWorkOrders = [
    {
        id: "WO-4021",
        farmId: "FARM-02",
        houseId: "HSE-B1",
        deviceId: "DEV-003",
        category: "Calibration",
        description: "Ammonia sensor reporting erratic spikes, suspect drift. Needs recalibration.",
        priority: "HIGH",
        status: "OPEN", // OPEN, IN_PROGRESS, PENDING_PARTS, RESOLVED
        assignedTo: "Tech Lead Sarah",
        openedAt: new Date(Date.now() - 1000 * 60 * 120).toISOString()
    },
    {
        id: "WO-4022",
        farmId: "FARM-01",
        houseId: "HSE-A2",
        deviceId: "ACT-004",
        category: "Actuator Fault",
        description: "Ventilation fan #4 bearing noise. Replacement required.",
        priority: "MEDIUM",
        status: "IN_PROGRESS",
        assignedTo: "Junior Tech Mike",
        openedAt: new Date(Date.now() - 1000 * 60 * 60 * 14).toISOString()
    },
    {
        id: "WO-4023",
        farmId: "FARM-03",
        houseId: "HSE-C1",
        deviceId: "DEV-012",
        category: "Connectivity",
        description: "Temp sensor dropped off mesh network.",
        priority: "LOW",
        status: "PENDING_PARTS",
        assignedTo: "Junior Tech Mike",
        openedAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString()
    }
];
