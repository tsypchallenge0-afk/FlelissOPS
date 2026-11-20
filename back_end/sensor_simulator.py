import requests
import random
import time

API_URL = "http://127.0.0.1:9000/telemetry/send"

# Replace with your real device id from /devices
DEVICE_ID = "YOUR_DEVICE_ID_HERE"

def generate_data():

    temperature = round(random.uniform(28, 40), 2)
    humidity = round(random.uniform(60, 90), 2)
    ammonia = round(random.uniform(5, 20), 2)

    return {
        "device_id": DEVICE_ID,
        "temperature": temperature,
        "humidity": humidity,
        "ammonia": ammonia
    }

while True:

    data = generate_data()

    try:
        r = requests.post(API_URL, json=data)

        print("Sent:", data)
        print("Response:", r.json())

    except Exception as e:
        print("Error:", e)

    time.sleep(5)