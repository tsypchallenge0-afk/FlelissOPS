/*
 * FlelissOPS Sensor Node - ESP32
 * Sensors: DHT22 (Temp/Hum), MQ-135 (Ammonia/Air Quality)
 * Display: OLED SSD1306 (I2C)
 * Protocol: MQTT
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// --- Configuration ---
const char* ssid = "YOUR_WIFI_SSID";          // <- set before flashing
const char* password = "YOUR_WIFI_PASSWORD";  // <- set before flashing
const char* mqtt_server = "192.168.1.100";     // <- LAN IP of the PC running Mosquitto
const int mqtt_port = 1883;
const char* device_id = "69aac9a67dee4c1c93b052ee"; // Matches DB Device ID
const char* mqtt_topic = "telemetry/send";

// --- Hardware Pins ---
#define DHTPIN 4
#define DHTTYPE DHT22
#define MQ135_PIN 34 // ADC1_CH6

// --- OLED Configuration ---
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1
#define SCREEN_ADDRESS 0x3C
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// --- Global Objects ---
DHT dht(DHTPIN, DHTTYPE);
WiFiClient espClient;
PubSubClient client(espClient);

// --- MQ-135 Calibration Constants ---
float R0 = 10.0; // Resistance in clean air (to be calibrated)
const float RL = 10.0; // Load resistance in kilo-ohms

// --- Timer ---
unsigned long lastMsg = 0;
#define INTERVAL 10000 // 10 seconds

void updateDisplayStatus(String statusMsg) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("FlelissOPS Sensor Node");
  display.println("-------------------");
  display.println(statusMsg);
  display.display();
}

void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.print("Connecting to ");
  Serial.println(ssid);

  updateDisplayStatus("Connecting WiFi...\n" + String(ssid));

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("");
  Serial.println("WiFi connected");
  Serial.println("IP address: ");
  Serial.println(WiFi.localIP());

  updateDisplayStatus("WiFi Connected!\nIP: " + WiFi.localIP().toString());
  delay(1000);
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection...");
    updateDisplayStatus("MQTT Connecting...");
    
    if (client.connect(device_id)) {
      Serial.println("connected");
      updateDisplayStatus("MQTT Connected!");
      delay(1000);
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      
      updateDisplayStatus("MQTT Failed!\nRC=" + String(client.state()) + "\nRetrying...");
      delay(5000);
    }
  }
}

float getAmmoniaPPM(int adcValue) {
  float vOut = (adcValue / 4095.0) * 3.3;
  if (vOut == 0) return 0;
  
  float rs = ((3.3 / vOut) - 1) * RL;
  float ratio = rs / R0;
  
  float ppm = 102.2 * pow(ratio, -2.473);
  return ppm;
}

void setup() {
  Serial.begin(115200);

  // Initialize OLED
  if(!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    Serial.println(F("SSD1306 allocation failed"));
    for(;;); // Don't proceed, loop forever
  }
  display.clearDisplay();
  display.display();

  dht.begin();
  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  unsigned long now = millis();
  if (now - lastMsg > INTERVAL) {
    lastMsg = now;

    // Read DHT22
    float h = dht.readHumidity();
    float t = dht.readTemperature();

    // Read MQ-135
    int analogValue = analogRead(MQ135_PIN);
    float nh3 = getAmmoniaPPM(analogValue);

    if (isnan(h) || isnan(t)) {
      Serial.println("Failed to read from DHT sensor!");
      updateDisplayStatus("Error:\nDHT Sensor Failed!");
      return;
    }

    // Update OLED Display with Live Data
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    
    display.setCursor(0, 0);
    display.println("--- LIVE DATA ---");
    
    display.setCursor(0, 15);
    display.print("Temp: ");
    display.print(t, 1);
    display.println(" C");
    
    display.setCursor(0, 25);
    display.print("Hum:  ");
    display.print(h, 1);
    display.println(" %");

    display.setCursor(0, 35);
    display.print("NH3:  ");
    display.print(nh3, 1);
    display.println(" ppm");

    display.setCursor(0, 50);
    display.print("MQTT: ");
    display.println(client.connected() ? "Connected" : "Disconnected");
    
    display.display();

    // Create JSON payload
    StaticJsonDocument<200> doc;
    doc["device_id"] = device_id;
    doc["temperature"] = round(t * 100.0) / 100.0;
    doc["humidity"] = round(h * 100.0) / 100.0;
    doc["ammonia"] = round(nh3 * 100.0) / 100.0;

    char buffer[256];
    serializeJson(doc, buffer);

    Serial.print("Publishing: ");
    Serial.println(buffer);
    client.publish(mqtt_topic, buffer);
  }
}
