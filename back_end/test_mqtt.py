import paho.mqtt.client as mqtt
import json
import time

# Use 2.0 style just in case
client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1)
client.connect("localhost", 1883, 60)

test_data = {
    "device_id": "69aac9a67dee4c1c93b052ee",
    "temperature": 25.0,
    "humidity": 50.0,
    "ammonia": 1.0
}

print("Publishing test message...")
client.publish("telemetry/send", json.dumps(test_data))
client.disconnect()
print("Done.")
