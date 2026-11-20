import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { api } from '../lib/Api';
import RoleLock from './RoleLock';
import PositionSelector from './PositionSelector';
import { sentence } from '../lib/format';

// ── Zod schemas ────────────────────────────────────────────────────────────

const farmSchema = z.object({
  name:     z.string().min(2, 'Name must be at least 2 characters').max(100),
  location: z.string().min(2, 'Location required').max(200),
});

const houseSchema = z.object({
  farm_id:    z.string().min(1, 'Select a farm'),
  name:       z.string().min(1, 'House name required').max(50),
  house_code: z.string()
    .min(2, 'House code required')
    .max(20)
    .regex(/^[A-Z0-9-]+$/, 'Uppercase letters, numbers and hyphens only'),
  capacity:   z.coerce.number()
    .int('Must be a whole number')
    .min(1, 'Capacity must be at least 1')
    .max(100000, 'Capacity too large'),
});

const deviceSchema = z.object({
  house_id:    z.string().min(1, 'Select a house'),
  device_type: z.enum(
    ['temperature_humidity', 'ammonia', 'combined', 'actuator_fan',
     'actuator_heater', 'actuator_feeder', 'actuator_lighting'],
    { errorMap: () => ({ message: 'Select a device type' }) }
  ),
  firmware:    z.string()
    .regex(/^v\d+\.\d+\.\d+$/, 'Format: vX.Y.Z (e.g. v2.1.4)')
    .optional()
    .or(z.literal('')),
  position:    z.enum([
    'Front-Left', 'Front-Center', 'Front-Right',
    'Middle-Left', 'Middle-Center', 'Middle-Right',
    'Back-Left', 'Back-Center', 'Back-Right'
  ], {
    errorMap: () => ({ message: 'Select an installation position' })
  }),
  device_id:   z.string().optional(),
});

// ── Device type options ────────────────────────────────────────────────────

const DEVICE_TYPE_OPTIONS = [
  { value: 'combined',             label: 'Combined Sensor (T + H + NH₃)' },
  { value: 'actuator_fan',         label: 'Fan Actuator' },
  { value: 'actuator_heater',      label: 'Heater Actuator' },
  { value: 'actuator_feeder',      label: 'Feeder Actuator' },
  { value: 'actuator_lighting',    label: 'Lighting Actuator' },
];

// ── Shared styled input ────────────────────────────────────────────────────

function Field({ label, error, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: 'block',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: error ? 'var(--danger)' : 'var(--text-dim)',
        marginBottom: 6,
      }}>
        {label}{error && <span style={{ marginLeft: 6, fontWeight: 400 }}>— {error}</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle = (hasError) => ({
  width: '100%',
  backgroundColor: 'var(--bg-surface)',
  border: `1px solid ${hasError ? 'var(--danger)' : 'var(--border-mid)'}`,
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
  fontSize: 13,
  padding: '8px 10px',
  borderRadius: 'var(--radius)',
  outline: 'none',
  transition: 'border-color 0.15s',
  boxSizing: 'border-box',
});

const selectStyle = (hasError) => ({
  ...inputStyle(hasError),
  cursor: 'pointer',
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238aaabf' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  paddingRight: 30,
});

// ── Tab button ─────────────────────────────────────────────────────────────

function TabButton({ label, active, done, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '10px 8px',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        border: 'none',
        borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
        backgroundColor: active ? 'var(--accent-glow)' : 'transparent',
        color: active ? 'var(--accent)'
             : done  ? 'var(--ok)'
             : 'var(--text-dim)',
        cursor: 'pointer',
        transition: 'all 0.15s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      {done && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="var(--ok)" strokeWidth="2.5">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      )}
      {label}
    </button>
  );
}

// ── Submit button ──────────────────────────────────────────────────────────

function SubmitButton({ label, loading }) {
  return (
    <button
      type="submit"
      disabled={loading}
      style={{
        width: '100%',
        padding: '10px 0',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        border: '1px solid var(--accent)',
        backgroundColor: 'var(--accent-glow)',
        color: 'var(--accent)',
        cursor: loading ? 'not-allowed' : 'pointer',
        borderRadius: 'var(--radius)',
        opacity: loading ? 0.6 : 1,
        transition: 'all 0.15s',
        marginTop: 8,
      }}
    >
      {loading ? 'Registering…' : label}
    </button>
  );
}

// ── Farm Form ──────────────────────────────────────────────────────────────

function FarmForm({ onSuccess }) {
  const { register, handleSubmit, reset,
          formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(farmSchema),
  });

  const onSubmit = async (data) => {
    try {
      const farm = await api.createFarm(data);
      toast.success(`Farm "${data.name}" registered successfully`);
      reset();
      onSuccess(farm);
    } catch (e) {
      const msg = e?.response?.data?.detail ?? 'Failed to register farm';
      toast.error(msg);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ padding: '20px 20px 0' }}>
      <Field label="Farm Name" error={errors.name?.message}>
        <input
          {...register('name')}
          placeholder="e.g. Farm Alpha"
          style={inputStyle(!!errors.name)}
        />
      </Field>

      <Field label="Location" error={errors.location?.message}>
        <input
          {...register('location')}
          placeholder="e.g. Northern Region, Sector 4"
          style={inputStyle(!!errors.location)}
        />
      </Field>

      <RoleLock requires="supervisor">
        <SubmitButton label="Register farm" loading={isSubmitting} />
      </RoleLock>
    </form>
  );
}

// ── House Form ─────────────────────────────────────────────────────────────

function HouseForm({ farms, onSuccess }) {
  const { register, handleSubmit, reset, watch, setValue,
          formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(houseSchema),
  });

  const houseName = watch('name');

  // Auto-generate house code from name
  useEffect(() => {
    if (houseName) {
      const slug = houseName
        .toUpperCase()
        .replace(/\s+/g, '-')
        .replace(/[^A-Z0-9-]/g, '')
        .substring(0, 16); // Ensure total length (with HSE-) is <= 20
      setValue('house_code', `HSE-${slug}`, { shouldValidate: true });
    }
  }, [houseName, setValue]);

  const onSubmit = async (data) => {
    const { farm_id, ...rest } = data;
    try {
      const house = await api.createHouse(farm_id, {
        ...rest,
        capacity: Number(rest.capacity),
      });
      toast.success(`House "${data.name}" registered under farm`);
      reset();
      onSuccess(house);
    } catch (e) {
      const msg = e?.response?.data?.detail ?? 'Failed to register house';
      toast.error(msg);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ padding: '20px 20px 0' }}>
      <Field label="Farm" error={errors.farm_id?.message}>
        <select {...register('farm_id')} style={selectStyle(!!errors.farm_id)}>
          <option value="">Select a farm...</option>
          {farms.map(f => (
            <option key={f.id ?? f.farm_id} value={f.id ?? f.farm_id}>
              {f.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="House Name" error={errors.name?.message}>
        <input
          {...register('name')}
          placeholder="e.g. House A"
          style={inputStyle(!!errors.name)}
        />
      </Field>

      <Field label="House Code" error={errors.house_code?.message}>
        <input
          {...register('house_code')}
          placeholder="e.g. HSE-A1"
          style={inputStyle(!!errors.house_code)}
          onInput={e => {
            e.target.value = e.target.value.toUpperCase();
          }}
        />
      </Field>

      <Field label="Bird Capacity" error={errors.capacity?.message}>
        <input
          {...register('capacity')}
          type="number"
          min={1}
          placeholder="e.g. 5000"
          style={inputStyle(!!errors.capacity)}
        />
      </Field>

      <RoleLock requires="supervisor">
        <SubmitButton label="Register house" loading={isSubmitting} />
      </RoleLock>
    </form>
  );
}

// ── Device Form ────────────────────────────────────────────────────────────

function DeviceForm({ farms, onSuccess }) {
  const [selectedFarmId, setSelectedFarmId] = useState('');
  const [houses, setHouses] = useState([]);
  const [loadingHouses, setLoadingHouses] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [discovered, setDiscovered] = useState([]);
  const [loadingDiscovered, setLoadingDiscovered] = useState(false);
  const [mqttStatus, setMqttStatus] = useState('unknown');
  const [registeredDevice, setRegisteredDevice] = useState(null);

  const { register, handleSubmit, reset, watch, setValue,
          formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(deviceSchema),
    defaultValues: { 
      position: 'Middle-Center',
      device_type: 'combined'
    },
  });

  const positionValue = watch('position');

  // Load houses when farm is selected
  useEffect(() => {
    if (!selectedFarmId) { 
       
      setHouses([]); 
      return; 
    }
     
    setLoadingHouses(true);
    api.getFarmHouses(selectedFarmId)
      .then(setHouses)
      .catch(() => toast.error('Failed to load houses'))
      .finally(() => setLoadingHouses(false));
  }, [selectedFarmId]);

  // Load discovered devices and MQTT status
  useEffect(() => {
    setLoadingDiscovered(true);
    
    const fetchData = async () => {
      try {
        const [disco, status] = await Promise.all([
          api.getDiscoveredDevices(),
          api.getSystemStatus()
        ]);
        setDiscovered(disco);
        setMqttStatus(status.mqtt || 'unknown');
      } catch (err) {
        console.error("Failed to load discovery data", err);
      } finally {
        setLoadingDiscovered(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const onSubmit = async (data) => {
    try {
      const payload = {
        house_id: data.house_id,
        type:     data.device_type,
        name:     `${data.device_type.replace('_', ' ').toUpperCase()} Node`,
        position: data.position,
        ...(data.firmware ? { model: data.firmware } : {}),
        ...(data.device_id ? { device_id: data.device_id } : {}),
      };
      const device = await api.createDevice(payload);
      setRegisteredDevice(device);
      toast.success(`Device registered successfully`);
      
      // Start verification
      setVerifying(true);
      try {
        // Wait a bit for the first MQTT message if it just connected
        await new Promise(r => setTimeout(r, 2000));
        const check = await api.checkDeviceConnectivity(device.id || device._id);
        setVerificationResult(check);
      } catch (err) {
        console.error("Verification failed", err);
        setVerificationResult({ status: 'offline', message: 'Verification failed' });
      } finally {
        setVerifying(false);
      }
      
      // We don't call onSuccess immediately, we let the user see the result
      // But we can reset the form
      // reset();
      // setSelectedFarmId('');
      // setHouses([]);
    } catch (e) {
      const msg = e?.response?.data?.detail ?? 'Failed to register device';
      toast.error(msg);
    }
  };

  if (verifying || verificationResult) {
    const devId = registeredDevice?.id || registeredDevice?._id || watch('device_id') || 'Generating…';
    
    return (
      <div style={{ padding: '30px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ textAlign: 'center' }}>
          <div className="section-label" style={{ marginBottom: 20, color: 'var(--accent)' }}>
            Provisioning console
          </div>
          
          <div style={{ 
            width: 60, height: 60, borderRadius: '50%', 
            backgroundColor: verifying ? 'var(--bg-surface)' : (verificationResult.status === 'online' ? 'var(--ok-glow)' : 'var(--warn-glow)'),
            border: `2px solid ${verifying ? 'var(--border-mid)' : (verificationResult.status === 'online' ? 'var(--ok)' : 'var(--warn)')}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 15px',
            animation: verifying ? 'pulse 1.5s infinite ease-in-out' : 'none'
          }}>
            {verifying ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                <path d="M2 12a10 10 0 0 1 10-10"/>
              </svg>
            ) : (
              <span style={{ fontSize: 24 }}>{verificationResult?.status === 'online' ? '✓' : '!'}</span>
            )}
          </div>

          <div className="mono" style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 4 }}>
            {verifying ? 'Scanning for signal…' : `NODE STATUS: ${sentence(verificationResult?.status) || 'Unknown'}`}
          </div>
          <div className="mono dim" style={{ fontSize: 10, marginBottom: 20 }}>
            {verifying 
              ? 'Waiting for device heartbeat...'
              : verificationResult?.status === 'online'
                ? `Connected successfully! (Last pulse ${verificationResult?.seconds_since_last_seen}s ago)`
                : 'Waiting for device to connect to the broker...'}
          </div>
        </div>

        {/* Provisioning Box */}
        <div className="panel" style={{ padding: 16, backgroundColor: 'var(--bg-dark)', border: '1px solid var(--border-mid)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div className="section-label" style={{ fontSize: 8 }}>Full ESP32 firmware template</div>
            <button 
              type="button"
              onClick={() => {
                const fullCode = `/*
 * Fleliss OPS - Sensor Node Firmware
 * Auto-generated for: ${devId}
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <ArduinoJson.h>

// --- Configuration ---
const char* ssid = "globalnet_att";
const char* password = "TTA@3eme";
const char* mqtt_server = "192.168.1.14";
const int mqtt_port = 10883;
const char* device_id = "${devId}";
const char* mqtt_topic = "telemetry/send";

#define DHTPIN 4
#define DHTTYPE DHT22
#define MQ135_PIN 34

DHT dht(DHTPIN, DHTTYPE);
WiFiClient espClient;
PubSubClient client(espClient);

void setup_wifi() {
  delay(10);
  Serial.print("Connecting to ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\\nWiFi connected");
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection...");
    if (client.connect(device_id)) {
      Serial.println("connected");
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  dht.begin();
  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
}

void loop() {
  if (!client.connected()) reconnect();
  client.loop();

  static unsigned long lastMsg = 0;
  if (millis() - lastMsg > 10000) {
    lastMsg = millis();
    float h = dht.readHumidity();
    float t = dht.readTemperature();
    int analogValue = analogRead(MQ135_PIN);

    StaticJsonDocument<200> doc;
    doc["device_id"] = device_id;
    doc["temperature"] = round(t * 100.0) / 100.0;
    doc["humidity"] = round(h * 100.0) / 100.0;
    doc["ammonia"] = analogValue; // Raw value or calibrated PPM

    char buffer[256];
    serializeJson(doc, buffer);
    client.publish(mqtt_topic, buffer);
    Serial.print("Published: ");
    Serial.println(buffer);
  }
}`;
                navigator.clipboard.writeText(fullCode);
                toast.success('Full firmware code copied to clipboard');
              }}
              style={{
                background: 'var(--accent-glow)', border: '1px solid var(--accent)',
                color: 'var(--accent)', fontSize: 9, padding: '4px 10px',
                borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--font-mono)'
              }}
            >
              Copy full code
            </button>
          </div>
          
          <div style={{ position: 'relative' }}>
            <pre className="mono" style={{ 
              fontSize: 10, 
              color: 'var(--ok)', 
              backgroundColor: 'rgba(0,0,0,0.3)', 
              padding: '12px', 
              borderRadius: 4,
              margin: 0,
              maxHeight: '200px',
              overflowY: 'auto',
              border: '1px solid rgba(31,189,110,0.2)',
              lineHeight: 1.4
            }}>
              {`// Auto-generated Firmware\n#include <WiFi.h>\n...\nconst char* device_id = "${devId}";\n...\nvoid loop() { ... }`}
            </pre>
          </div>

          <div className="mono dim" style={{ fontSize: 9, marginTop: 12, lineHeight: 1.4 }}>
            This code includes the <span style={{ color: 'var(--accent)' }}>Wifi</span>, <span style={{ color: 'var(--accent)' }}>MQTT</span>, and <span style={{ color: 'var(--accent)' }}>Sensor</span> logic pre-configured for this Node.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          <button
            className="pill-btn mono active"
            onClick={() => {
              setVerificationResult(null);
              setRegisteredDevice(null);
              reset();
              setSelectedFarmId('');
              onSuccess();
            }}
            style={{ width: '100%', padding: '12px' }}
          >
            Complete installation
          </button>
          
          {!verifying && (
            <button
              className="pill-btn mono"
              onClick={async () => {
                setVerifying(true);
                try {
                  const check = await api.checkDeviceConnectivity(devId);
                  setVerificationResult(check);
                } catch (_err) {
                  toast.error('Check failed');
                } finally {
                  setVerifying(false);
                }
              }}
              style={{ width: '100%', padding: '12px' }}
            >
              Refresh connection status
            </button>
          )}
        </div>

        <style>{`
          @keyframes pulse {
            0% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.05); opacity: 0.7; }
            100% { transform: scale(1); opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ padding: '20px 20px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, padding: '8px 12px', backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border-dim)' }}>
        <div className="section-label" style={{ fontSize: 9 }}>Core service status</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
           <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)' }}>MQTT broker:</span>
           <span className="mono" style={{ fontSize: 9, color: mqttStatus === 'connected' ? 'var(--ok)' : 'var(--danger)', fontWeight: 'bold' }}>
             {sentence(mqttStatus)}
           </span>
           <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: mqttStatus === 'connected' ? 'var(--ok)' : 'var(--danger)', display: 'inline-block' }} />
        </div>
      </div>

      {/* Farm selector — not part of schema, just used to filter houses */}
      <Field label="Farm (filter houses)">
        <select
          value={selectedFarmId}
          onChange={e => setSelectedFarmId(e.target.value)}
          style={selectStyle(false)}
        >
          <option value="">Select a farm to filter houses...</option>
          {farms.map(f => (
            <option key={f.id ?? f.farm_id} value={f.id ?? f.farm_id}>
              {f.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="House" error={errors.house_id?.message}>
        <select
          {...register('house_id')}
          disabled={!selectedFarmId || loadingHouses}
          style={{
            ...selectStyle(!!errors.house_id),
            opacity: !selectedFarmId ? 0.5 : 1,
          }}
        >
          <option value="">
            {loadingHouses ? 'Loading houses...' : 'Select a house...'}
          </option>
          {houses.map(h => (
            <option key={h.id ?? h.house_id} value={h.id ?? h.house_id}>
              {h.name ?? h.house_code}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Device Type" error={errors.device_type?.message}>
        <select {...register('device_type')} style={selectStyle(!!errors.device_type)}>
          <option value="">Select device type...</option>
          {DEVICE_TYPE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </Field>

      <Field label="Firmware Version (optional)" error={errors.firmware?.message}>
        <input
          {...register('firmware')}
          placeholder="e.g. v2.1.4"
          style={inputStyle(!!errors.firmware)}
        />
      </Field>

        <div style={{ padding: '12px', backgroundColor: 'var(--bg-dark)', borderRadius: 'var(--radius)', border: '1px solid var(--border-mid)', marginBottom: '14px' }}>
          <Field label="Node provisioning ID">
            <div className="mono dim" style={{ fontSize: 9, marginBottom: 8 }}>Enter a custom ID (e.g. FLS-NODE-001) or leave blank to auto-generate.</div>
             <input 
               {...register('device_id')}
               placeholder="Custom node ID (optional)"
               style={{...inputStyle(false), fontWeight: 'bold', color: 'var(--accent)'}}
             />
          </Field>

          <div className="mono dim" style={{ fontSize: 8, textAlign: 'center', margin: '12px 0', opacity: 0.5 }}>— OR SELECT FROM DISCOVERED PULSES —</div>

          <Field label="Auto-discovered nodes">
            <select 
              {...register('device_id')} 
              style={selectStyle(!!errors.device_id)}
            >
              <option value="">Select a detected device</option>
              {discovered.map(d => (
                <option key={d.device_id} value={d.device_id}>
                  {d.device_id} ({new Date(d.last_seen).toLocaleTimeString()})
                </option>
              ))}
            </select>
            {loadingDiscovered && <div className="mono dim" style={{ fontSize: 8, marginTop: 4 }}>Listening for hardware heartbeats...</div>}
          </Field>
        </div>

      <PositionSelector
        value={positionValue}
        onChange={(val) => setValue('position', val, { shouldValidate: true })}
        error={errors.position?.message}
      />

      <RoleLock requires="supervisor">
        <SubmitButton label="Register device" loading={isSubmitting} />
      </RoleLock>
    </form>
  );
}

// ── Main Drawer ────────────────────────────────────────────────────────────

export default function RegistrationDrawer({ isOpen, onClose, onRegistered, farms }) {
  const [activeTab, setActiveTab] = useState('farm');
  const [doneTabs,  setDoneTabs]  = useState(new Set());

  // Reset tab state when drawer opens
  useEffect(() => {
    if (isOpen) {
       
      setActiveTab('farm');
       
      setDoneTabs(new Set());
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSuccess = (tab, nextTab, result) => {
    setDoneTabs(prev => new Set([...prev, tab]));
    setActiveTab(nextTab ?? tab);
    onRegistered?.(tab, result);  // notify CommandCenter to refresh
  };

  const TABS = [
    { key: 'farm',   label: 'Farm'   },
    { key: 'house',  label: 'House'  },
    { key: 'device', label: 'Device' },
  ];

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0,
            backgroundColor: 'rgba(0,0,0,0.45)',
            zIndex: 400,
            animation: 'fadeIn 0.2s ease',
          }}
        />
      )}

      {/* Drawer */}
      <div style={{
        position: 'fixed',
        top: 0, right: 0, bottom: 0,
        width: 400,
        background: 'var(--bg-panel)',
        borderLeft: '1px solid var(--border-mid)',
        zIndex: 401,
        display: 'flex',
        flexDirection: 'column',
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: isOpen ? '-8px 0 32px rgba(0,0,0,0.25)' : 'none',
      }}>

        {/* Drawer header */}
        <div style={{
          padding: '0 20px',
          height: 'var(--header-height)',
          borderBottom: '1px solid var(--border-dim)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 16, fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-primary)',
              lineHeight: 1,
            }}>
              Register
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--text-dim)',
              letterSpacing: '0.1em',
              marginTop: 3,
            }}>
              // FARM · HOUSE · DEVICE
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-dim)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              width: 32, height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-dim)',
          flexShrink: 0,
        }}>
          {TABS.map(tab => (
            <TabButton
              key={tab.key}
              label={tab.label}
              active={activeTab === tab.key}
              done={doneTabs.has(tab.key)}
              onClick={() => setActiveTab(tab.key)}
            />
          ))}
        </div>

        {/* Form content — scrollable */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {activeTab === 'farm' && (
            <FarmForm
              onSuccess={(result) => handleSuccess('farm', 'house', result)}
            />
          )}
          {activeTab === 'house' && (
            <HouseForm
              farms={farms}
              onSuccess={(result) => handleSuccess('house', 'device', result)}
            />
          )}
          {activeTab === 'device' && (
            <DeviceForm
              farms={farms}
              onSuccess={(result) => handleSuccess('device', null, result)}
            />
          )}
        </div>

        {/* Footer hint */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--border-dim)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--text-dim)',
          letterSpacing: '0.08em',
          flexShrink: 0,
        }}>
          {activeTab === 'farm'
            ? 'Register the farm first, then add houses and devices'
            : activeTab === 'house'
            ? 'Select an existing farm to assign this house to'
            : 'Select a farm to filter available houses'}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </>
  );
}
