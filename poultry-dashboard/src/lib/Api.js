import axios from 'axios';

const BASE = import.meta.env.VITE_API_BASE_URL || '/api';
const client = axios.create({ baseURL: BASE });

// Attach JWT from storage for authenticated endpoints.
client.interceptors.request.use((config) => {
    const token = localStorage.getItem('roboflelis_token');
    if (token) {
        config.headers = config.headers ?? {};
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Keep legacy direct axios.* calls authenticated too.
axios.interceptors.request.use((config) => {
    const token = localStorage.getItem('roboflelis_token');
    if (token) {
        config.headers = config.headers ?? {};
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// ── Response normalisers ───────────────────────────────────────────────────
const toArray = (res) => {
    const d = res.data;
    if (Array.isArray(d)) return d;
    if (d?.data && Array.isArray(d.data)) return d.data;
    if (d?.results && Array.isArray(d.results)) return d.results;
    if (d?.items && Array.isArray(d.items)) return d.items;
    return [];
};

const toObject = (res) => {
    const d = res.data;
    if (d?.data && typeof d.data === 'object') return d.data;
    return d ?? {};
};

// ── API Definition ────────────────────────────────────────────────────────
export const api = {
    client,
    getSystemStatus: () => axios.get(`${BASE}/`).then(res => res.data),

    // ── Auth ──────────────────────────────────────────────────────────────
    register: (data) => axios.post(`${BASE}/auth/register`, data).then(toObject),
    login: (creds) => axios.post(`${BASE}/auth/login`, creds).then(r => r.data),
    me: () => axios.get(`${BASE}/auth/me`).then(toObject),
    logout: () => axios.post(`${BASE}/auth/logout`).then(toObject),

    // ── Telemetry (existing) ──────────────────────────────────────────────
    getTelemetry: (params = {}) => {
        const normalized = { ...params };
        if (normalized.houseId && !normalized.house_id) {
            normalized.house_id = normalized.houseId;
            delete normalized.houseId;
        }
        if (normalized.deviceId && !normalized.device_id) {
            normalized.device_id = normalized.deviceId;
            delete normalized.deviceId;
        }
        return axios.get(`${BASE}/telemetry`, { params: normalized }).then(toArray);
    },
    getAlerts: (params = {}) => {
        const normalized = { ...params };
        if (normalized.houseId && !normalized.house_id) {
            normalized.house_id = normalized.houseId;
            delete normalized.houseId;
        }
        return axios.get(`${BASE}/telemetry/alerts`, { params: normalized }).then(toArray);
    },
    acknowledgeAllAlerts: (data) => axios.post(`${BASE}/telemetry/acknowledge-all`, data).then(toObject),
    getAnalytics: () => axios.get(`${BASE}/telemetry/analytics`).then(toObject),
    getTrends: (params) => axios.get(`${BASE}/telemetry/analytics/trends`, { params }).then(toArray),
    patchAlert: (id, data) => axios.patch(`${BASE}/telemetry/alerts/${id}`, data).then(toObject),
    silenceAlert: (id, data) => axios.post(`${BASE}/telemetry/alerts/${id}/silence`, data).then(toObject),
    escalateAlert: (id, data) => axios.post(`${BASE}/telemetry/alerts/${id}/escalate`, data).then(toObject),

    // ── Alert rules ───────────────────────────────────────────────────────
    getAlertRules: () => axios.get(`${BASE}/alerts/rules`).then(toArray),
    patchAlertRule: (id, data) => axios.patch(`${BASE}/alerts/rules/${id}`, data).then(toObject),
    createAlertRule: (data) => axios.post(`${BASE}/alerts/rules`, data).then(toObject),

    // ── Devices (existing) ────────────────────────────────────────────────
    getDevices: (params) => axios.get(`${BASE}/devices`, { params }).then(toArray),
    getDevice: (id) => axios.get(`${BASE}/devices/${id}`).then(toObject),
    patchDevice: (id, d) => axios.patch(`${BASE}/devices/${id}`, d).then(toObject),
    deleteDevice: (id) => axios.delete(`${BASE}/devices/${id}`).then(toObject),
    rebootDevice: (id, d) => axios.post(`${BASE}/devices/${id}/reboot`, d).then(toObject),
    updateFirmware: (id, d) => axios.post(`${BASE}/devices/${id}/firmware/update`, d).then(toObject),
    getDeviceHistory: (id, params) => axios.get(`${BASE}/devices/${id}/history`, { params }).then(toArray),
    checkDeviceConnectivity: (id) => axios.get(`${BASE}/devices/${id}/check`).then(toObject),
    getDiscoveredDevices: () => axios.get(`${BASE}/devices/discovered`).then(toArray),

    // ── Enhanced device endpoints ─────────────────────────────────────────
    getHouseSensors: (houseId) => axios.get(`${BASE}/houses/${houseId}/sensors`).then(toArray),
    getHouseActuators: (houseId) => axios.get(`${BASE}/houses/${houseId}/actuators`).then(toArray),
    getSensorHistory: (deviceId, minutes = 60) =>
        axios.get(`${BASE}/devices/${deviceId}/history`, { params: { minutes } }).then(toArray),

    // ── Farms ─────────────────────────────────────────────────────────────
    getFarms: () => axios.get(`${BASE}/farms`).then(toArray),
    getFarm: (id) => axios.get(`${BASE}/farms/${id}`).then(toObject),
    createFarm: (data) => axios.post(`${BASE}/farms`, data).then(toObject),
    updateFarm: (id, d) => axios.patch(`${BASE}/farms/${id}`, d).then(toObject),
    getFarmHouses: (id) => axios.get(`${BASE}/farms/${id}/houses`).then(toArray),
    getFarmAlerts: (id, p) => axios.get(`${BASE}/farms/${id}/alerts`, { params: p }).then(toArray),
    patchFarmCtrl: (id, d) => axios.patch(`${BASE}/farms/${id}/controls`, d).then(toObject),
    emergencyCooling: (id, d) => axios.post(`${BASE}/farms/${id}/controls/emergency-cooling`, d).then(toObject),

    // ── Houses ────────────────────────────────────────────────────────────
    getHouse: (id) => axios.get(`${BASE}/houses/${id}`).then(toObject),
    createHouse: (farmId, data) => axios.post(`${BASE}/farms/${farmId}/houses`, data).then(toObject),
    getHouseControls: (id) => axios.get(`${BASE}/houses/${id}/controls`).then(toObject),
    getHouseDevices: (id) => axios.get(`${BASE}/houses/${id}/devices`).then(toArray),
    getHouseEnvironment: (houseId) => axios.get(`${BASE}/houses/${houseId}/environment`).then(toObject),

    // ── Demo scenario (heat wave → alert → AI response → recovery) ────────
    startHeatStressDemo: (houseId) => axios.post(`${BASE}/houses/${houseId}/demo/heat-stress`).then(toObject),
    getDemoStatus: (houseId) => axios.get(`${BASE}/houses/${houseId}/demo/status`).then(toObject),

    // ── Actuator controls ─────────────────────────────────────────────────
    setHouseControlMode: (id, deviceType, d) => axios.post(`${BASE}/houses/${id}/controls/${deviceType}/mode`, d).then(toObject),
    patchFans: (id, d) => axios.patch(`${BASE}/houses/${id}/controls/fans`, d).then(toObject),
    boostFans: (id, d) => axios.post(`${BASE}/houses/${id}/controls/fans/boost`, d).then(toObject),
    setFanMode: (id, d) => axios.post(`${BASE}/houses/${id}/controls/fans/mode`, d).then(toObject),
    patchHeater: (id, d) => axios.patch(`${BASE}/houses/${id}/controls/heater`, d).then(toObject),
    activateHeater: (id, d) => axios.post(`${BASE}/houses/${id}/controls/heater/activate`, d).then(toObject),
    triggerFeeder: (id, d) => axios.post(`${BASE}/houses/${id}/controls/feeder/trigger`, d).then(toObject),
    patchFeeder: (id, d) => axios.patch(`${BASE}/houses/${id}/controls/feeder/schedule`, d).then(toObject),
    patchLighting: (id, d) => axios.patch(`${BASE}/houses/${id}/controls/lighting`, d).then(toObject),

    // ── Global control ────────────────────────────────────────────────────
    getControlSummary: () => axios.get(`${BASE}/control/summary`).then(toObject),
    batchControl: (data) => axios.post(`${BASE}/control/batch`, data).then(toObject),
    getScheduledCommands: () => axios.get(`${BASE}/control/scheduled-commands`).then(toArray),
    createScheduledCommand: (data) => axios.post(`${BASE}/control/scheduled-commands`, data).then(toObject),
    deleteScheduledCommand: (id) => axios.delete(`${BASE}/control/scheduled-commands/${id}`).then(toObject),

    // ── Work orders ───────────────────────────────────────────────────────
    getWorkOrders: (params) => axios.get(`${BASE}/maintenance/workorders`, { params }).then(toArray),
    createWorkOrder: (data) => axios.post(`${BASE}/maintenance/workorders`, data).then(toObject),
    patchWorkOrder: (id, d) => axios.patch(`${BASE}/maintenance/workorders/${id}`, d).then(toObject),
    deleteWorkOrder: (id) => axios.delete(`${BASE}/maintenance/workorders/${id}`).then(toObject),
    exportWorkOrders: (params) =>
        axios.get(`${BASE}/maintenance/workorders/export`, { params, responseType: 'blob' }).then(r => r.data),

    // ── Users ─────────────────────────────────────────────────────────────
    getUsers: () => axios.get(`${BASE}/users`).then(toArray),
    createUser: (data) => axios.post(`${BASE}/users`, data).then(toObject),
    updateUser: (id, data) => axios.patch(`${BASE}/users/${id}`, data).then(toObject),
    deactivateUser: (id) => axios.delete(`${BASE}/users/${id}`).then(toObject),
    resetUserPassword: (id, data) => axios.patch(`${BASE}/users/${id}/reset-password`, data).then(toObject),

    // ── User invitations ──────────────────────────────────────────────────
    inviteUser: (data) => axios.post(`${BASE}/users/invite`, data).then(toObject),
    getInvitations: () => axios.get(`${BASE}/users/invitations`).then(toArray),
    revokeInvitation: (id) => axios.delete(`${BASE}/users/invitations/${id}`).then(toObject),

    // ── AI predictions ────────────────────────────────────────────────────
    getPredictions: (houseId) =>
        axios.get(`${BASE}/ai/predictions/${houseId}`).then(toObject),
    getPredictionForMetric: (houseId, metric) =>
        axios.get(`${BASE}/ai/predictions/${houseId}/${metric}`).then(toObject),
    getAICoverage: (houseId) =>
        axios.get(`${BASE}/ai/coverage/${houseId}`).then(toObject),
    getAIActions: (houseId, limit = 50) =>
        axios.get(`${BASE}/ai/actions/${houseId}`, { params: { limit } }).then(toArray),
    getAllAIActions: (limit = 200) =>
        axios.get(`${BASE}/ai/actions`, { params: { limit } }).then(toArray),
    triggerAITraining: (houseId) =>
        axios.post(`${BASE}/ai/train/${houseId}`).then(toObject),

    // ── Flock management ─────────────────────────────────────────────────
    getFlocks: (params) => axios.get(`${BASE}/flocks`, { params }).then(toArray),
    getFlock: (id) => axios.get(`${BASE}/flocks/${id}`).then(toObject),
    createFlock: (data) => axios.post(`${BASE}/flocks`, data).then(toObject),
    updateFlock: (id, d) => axios.patch(`${BASE}/flocks/${id}`, d).then(toObject),
    getFlockEntries: (id) => axios.get(`${BASE}/flocks/${id}/entries`).then(toArray),
    createFlockEntry: (id, d) => axios.post(`${BASE}/flocks/${id}/entries`, d).then(toObject),
    getFlockKPIs: (id) => axios.get(`${BASE}/flocks/${id}/kpis`).then(toObject),
    getMortality: (id) => axios.get(`${BASE}/flocks/${id}/mortality`).then(toArray),
    createMortality: (id, d) => axios.post(`${BASE}/flocks/${id}/mortality`, d).then(toObject),
    ackMortality: (fId, mId) =>
        axios.patch(`${BASE}/flocks/${fId}/mortality/${mId}`, { acknowledged: true }).then(toObject),
    getFlockCorrelation: (flockId, houseId, windowDays = 42) => axios.get(`${BASE}/analytics/flock-correlation`, {
        params: { flock_id: flockId, house_id: houseId, window_days: windowDays }
    }).then(toObject),
    getFlockCurves: (flockId) => axios.get(`${BASE}/flocks/${flockId}/curves`).then(toArray),
    createFlockCurve: (flockId, data) => axios.post(`${BASE}/flocks/${flockId}/curves`, data).then(toObject),
    updateFlockCurve: (flockId, curveType, data) => axios.patch(`${BASE}/flocks/${flockId}/curves/${curveType}`, data).then(toObject),
    getTodaysSetpoints: (flockId) => axios.get(`${BASE}/flocks/${flockId}/setpoints/today`).then(toObject),
    getCurveTemplates: (curveType) => axios.get(`${BASE}/flocks/curve-templates`, { params: curveType ? { curve_type: curveType } : {} }).then(toArray),
    saveAsTemplate: (data) => axios.post(`${BASE}/flocks/curve-templates`, data).then(toObject),

    // ── Analytics BI ─────────────────────────────────────────────────────
    getFarmsComparison: (windowDays = 30) =>
        axios.get(`${BASE}/analytics/farms/comparison`, { params: { window_days: windowDays } }).then(toArray),
    getEfficiency: (farmId, windowDays = 30) =>
        axios.get(`${BASE}/analytics/efficiency`, { params: { farm_id: farmId, window_days: windowDays } }).then(toObject),
    getAlertPatterns: (farmId, windowDays = 30) =>
        axios.get(`${BASE}/analytics/alert-patterns`, { params: { farm_id: farmId, window_days: windowDays } }).then(toObject),

    // ── Reports ───────────────────────────────────────────────────────────
    getReportSchedules: () =>
        axios.get(`${BASE}/reports/schedules`).then(toArray),
    createReportSchedule: (data) =>
        axios.post(`${BASE}/reports/schedules`, data).then(toObject),
    updateReportSchedule: (id, data) =>
        axios.patch(`${BASE}/reports/schedules/${id}`, data).then(toObject),
    deleteReportSchedule: (id) =>
        axios.delete(`${BASE}/reports/schedules/${id}`).then(toObject),
    downloadReport: (farmId, windowDays = 30) =>
        axios.get(`${BASE}/reports/generate/${farmId}`, {
            params: { window_days: windowDays },
            responseType: 'blob',
        }).then(r => r.data),

    // ── Super admin — tenant management ───────────────────────────────────
    getPlatformStats: () =>
        axios.get(`${BASE}/super-admin/platform/stats`).then(toObject),
    getTenants: (params) =>
        axios.get(`${BASE}/super-admin/tenants`, { params }).then(toArray),
    getTenant: (id) =>
        axios.get(`${BASE}/super-admin/tenants/${id}`).then(toObject),
    createTenant: (data) =>
        axios.post(`${BASE}/super-admin/tenants`, data).then(toObject),
    updateTenant: (id, data) =>
        axios.patch(`${BASE}/super-admin/tenants/${id}`, data).then(toObject),
    suspendTenant: (id, data) =>
        axios.post(`${BASE}/super-admin/tenants/${id}/suspend`, data).then(toObject),
    activateTenant: (id) =>
        axios.post(`${BASE}/super-admin/tenants/${id}/activate`).then(toObject),
    getTenantUsers: (id) =>
        axios.get(`${BASE}/super-admin/tenants/${id}/users`).then(toArray),
    getTenantInvitations: (id) =>
        axios.get(`${BASE}/super-admin/tenants/${id}/invitations`).then(toArray),
    deleteTenant: (id) =>
        axios.delete(`${BASE}/super-admin/tenants/${id}`).then(toObject),
    checkSubdomainAvailable: (slug) =>
        axios.get(`${BASE}/tenants/branding/${slug}`),

    // ── Device registration ───────────────────────────────────────────────
    createDevice: (data) => axios.post(`${BASE}/devices`, data).then(toObject),

};