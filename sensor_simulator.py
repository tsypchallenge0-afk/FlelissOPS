import requests
import random
import time

API_URL = "http://127.0.0.1:9000/telemetry/send"

# Replace with your real device id
DEVICE_ID = "69aac9a67dee4c1c93b052ee"

while True:

    data = {
        "device_id": DEVICE_ID,
        "temperature": round(random.uniform(28, 40), 2),
        "humidity": round(random.uniform(60, 90), 2),
        "ammonia": round(random.uniform(5, 20), 2)
    }

    try:

        response = requests.post(API_URL, json=data)

        print("Sent:", data)
        print("Response:", response.json())
        print("------")

    except Exception as e:
        print("Error:", e)

    time.sleep(5)