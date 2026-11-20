/*
 * Fleliss OPS Actuator Node - ESP32
 * Controls: Fans, Heaters, Feeders, Lighting
 * Display: OLED SSD1306 (I2C)
 * Protocol: MQTT (Subscribed to commands)
 *
 * SETUP: Set your device_id and house_id below before uploading.
 *        Find them in your Dashboard under Devices.
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// --- Configuration ---
const char* ssid = "YOUR_WIFI_SSID";          // <- set before flashing
const char* password = "YOUR_WIFI_PASSWORD";  // <- set before flashing
const char* mqtt_server = "192.168.1.100";     // <- LAN IP of the PC running Mosquitto
const int mqtt_port = 1883;

// ⚠️ IMPORTANT: Set these before uploading!
const char* device_id = "69aac9a67dee4c1c93b052ee"; // Your Device ID from the Dashboard
const char* house_id  = "REPLACE_WITH_YOUR_HOUSE_ID"; // Your House ID from the Dashboard

// --- Hardware Pins ---
#define FAN_PIN 18      // PWM pin (LED dims for speed)
#define HEATER_PIN 19   // Relay pin
#define FEEDER_PIN 5    // Relay pin (moved from 21 to free I2C SDA)
#define LIGHT_PIN 23    // Relay pin (moved from 22 to free I2C SCL)

// --- OLED Configuration ---
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1
#define SCREEN_ADDRESS 0x3C
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
bool oledAvailable = false;

// --- Global Objects ---
WiFiClient espClient;
PubSubClient client(espClient);

// --- Device State Tracking ---
bool fanRunning = false;
int  fanSpeed = 0;
bool heaterActive = false;
bool feederActive = false;
bool lightOn = false;
int  lightBrightness = 0;
String lastCommand = "None";

// --- Timers ---
unsigned long lastHeartbeat = 0;
unsigned long lastDisplayUpdate = 0;
const unsigned long HEARTBEAT_INTERVAL = 10000;
const unsigned long DISPLAY_INTERVAL = 2000;

// =============================================
//              OLED DISPLAY
// =============================================

void drawStatusScreen() {
  if (!oledAvailable) return;

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  // --- Header ---
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("FLELISS ACTUATOR NODE");

  // --- Divider ---
  display.drawLine(0, 10, 127, 10, SSD1306_WHITE);

  // --- WiFi & MQTT Status ---
  display.setCursor(0, 14);
  display.print("WiFi:");
  display.print(WiFi.status() == WL_CONNECTED ? "OK" : "NO");
  display.print("  MQTT:");
  display.println(client.connected() ? "OK" : "NO");

  // --- Divider ---
  display.drawLine(0, 24, 127, 24, SSD1306_WHITE);

  // --- Device States ---
  display.setCursor(0, 28);
  display.print("Fan:    ");
  if (fanRunning) {
    display.print("ON ");
    display.print(fanSpeed);
    display.println("%");
  } else {
    display.println("OFF");
  }

  display.setCursor(0, 38);
  display.print("Heater: ");
  display.println(heaterActive ? "ON" : "OFF");

  display.setCursor(0, 48);
  display.print("Light:  ");
  if (lightOn) {
    display.print("ON ");
    display.print(lightBrightness);
    display.println("%");
  } else {
    display.println("OFF");
  }

  display.setCursor(0, 58);
  display.print("Feeder: ");
  display.println(feederActive ? "RUNNING" : "IDLE");

  display.display();
}

void showBootMessage(String line1, String line2) {
  if (!oledAvailable) return;

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("FLELISS ACTUATOR NODE");
  display.drawLine(0, 10, 127, 10, SSD1306_WHITE);
  display.setCursor(0, 20);
  display.println(line1);
  display.setCursor(0, 35);
  display.println(line2);
  display.display();
}

// =============================================
//              WIFI & MQTT
// =============================================

void setup_wifi() {
  delay(10);
  Serial.println("\n[SYSTEM] Starting WiFi initialization...");
  Serial.print("[WIFI] Connecting to ");
  Serial.println(ssid);
  showBootMessage("Connecting WiFi...", String(ssid));

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("[WIFI] Successfully connected!");
  Serial.print("[WIFI] IP address: ");
  Serial.println(WiFi.localIP());
  showBootMessage("WiFi Connected!", "IP: " + WiFi.localIP().toString());
  delay(1000);
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("[MQTT] Attempting connection...");
    showBootMessage("MQTT Connecting...", mqtt_server);

    if (client.connect(device_id)) {
      Serial.println("CONNECTED!");

      String subTopic = "commands/" + String(house_id) + "/#";
      client.subscribe(subTopic.c_str());
      Serial.print("[MQTT] Subscribed to: ");
      Serial.println(subTopic);
      Serial.println("[SYSTEM] Ready for commands!\n");
      showBootMessage("MQTT Connected!", "Listening...");
      delay(1000);
    } else {
      Serial.print("FAILED, rc=");
      Serial.print(client.state());
      Serial.println(" - Retrying in 5 seconds...");
      showBootMessage("MQTT Failed!", "RC=" + String(client.state()));
      delay(5000);
    }
  }
}

// =============================================
//            COMMAND HANDLER
// =============================================

void callback(char* topic, byte* payload, unsigned int length) {
  Serial.println("\n=========================================");
  Serial.println("[CMD] --- New Command Received ---");
  Serial.print("[CMD] Topic: ");
  Serial.println(topic);

  String message;
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.print("[CMD] Payload: ");
  Serial.println(message);

  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, message);
  if (error) {
    Serial.print("[ERROR] deserializeJson() failed: ");
    Serial.println(error.c_str());
    Serial.println("=========================================\n");
    return;
  }

  String topicStr = String(topic);

  if (topicStr.endsWith("/fan")) {
    fanSpeed = doc["state"]["speed_percent"];
    fanRunning = doc["state"]["running"];
    lastCommand = "Fan " + String(fanRunning ? "ON" : "OFF");
    Serial.println("[ACTION] -> Triggering FAN");
    Serial.printf("        -> Status: %s\n", fanRunning ? "ON" : "OFF");
    Serial.printf("        -> Speed: %d%%\n", fanSpeed);
    analogWrite(FAN_PIN, fanRunning ? map(fanSpeed, 0, 100, 0, 255) : 0);
  }
  else if (topicStr.endsWith("/heater")) {
    heaterActive = doc["state"]["active"];
    lastCommand = "Heater " + String(heaterActive ? "ON" : "OFF");
    Serial.println("[ACTION] -> Triggering HEATER");
    Serial.printf("        -> Status: %s\n", heaterActive ? "ON" : "OFF");
    digitalWrite(HEATER_PIN, heaterActive ? HIGH : LOW);
  }
  else if (topicStr.endsWith("/feeder")) {
    feederActive = true;
    lastCommand = "Feeder Triggered";
    Serial.println("[ACTION] -> Triggering FEEDER");
    Serial.println("        -> Status: ON (Running for 2 seconds)");
    drawStatusScreen();
    digitalWrite(FEEDER_PIN, HIGH);
    delay(2000);
    digitalWrite(FEEDER_PIN, LOW);
    feederActive = false;
    Serial.println("        -> Status: OFF (Completed)");
  }
  else if (topicStr.endsWith("/lighting")) {
    lightOn = doc["state"]["on"];
    lightBrightness = doc["state"]["brightness"];
    lastCommand = "Light " + String(lightOn ? "ON" : "OFF");
    Serial.println("[ACTION] -> Triggering LIGHTING");
    Serial.printf("        -> Status: %s\n", lightOn ? "ON" : "OFF");
    Serial.printf("        -> Brightness: %d%%\n", lightBrightness);
    digitalWrite(LIGHT_PIN, lightOn ? HIGH : LOW);
  }
  else {
    Serial.println("[WARNING] Unknown command topic!");
  }

  Serial.println("=========================================\n");

  // Immediately refresh the OLED after any command
  drawStatusScreen();
}

// =============================================
//              SETUP & LOOP
// =============================================

void setup() {
  Serial.begin(115200);
  Serial.println("\n\n=========================================");
  Serial.println("       FLELISS OPS - ACTUATOR NODE       ");
  Serial.println("=========================================");
  Serial.print("[CONFIG] Device ID: ");
  Serial.println(device_id);
  Serial.print("[CONFIG] House ID:  ");
  Serial.println(house_id);
  Serial.println("-----------------------------------------");

  // Initialize OLED
  if (display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    oledAvailable = true;
    display.clearDisplay();
    display.display();
    Serial.println("[OLED] SSD1306 initialized successfully.");
  } else {
    oledAvailable = false;
    Serial.println("[OLED] SSD1306 not found. Continuing without display.");
  }

  // Initialize pins
  pinMode(FAN_PIN, OUTPUT);
  pinMode(HEATER_PIN, OUTPUT);
  pinMode(FEEDER_PIN, OUTPUT);
  pinMode(LIGHT_PIN, OUTPUT);

  // Ensure everything is OFF on boot
  analogWrite(FAN_PIN, 0);
  digitalWrite(HEATER_PIN, LOW);
  digitalWrite(FEEDER_PIN, LOW);
  digitalWrite(LIGHT_PIN, LOW);
  Serial.println("[SYSTEM] All pins initialized to OFF state.");

  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  unsigned long now = millis();

  // Serial Heartbeat
  if (now - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    lastHeartbeat = now;
    Serial.printf("[STATUS] ALIVE | WiFi:%s | MQTT:%s | Last CMD: %s\n",
      WiFi.status() == WL_CONNECTED ? "OK" : "NO",
      client.connected() ? "OK" : "NO",
      lastCommand.c_str());
  }

  // OLED Refresh
  if (now - lastDisplayUpdate >= DISPLAY_INTERVAL) {
    lastDisplayUpdate = now;
    drawStatusScreen();
  }
}
