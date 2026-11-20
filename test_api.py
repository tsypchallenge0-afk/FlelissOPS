import requests
import uuid

def test_api():
    base_url = "http://127.0.0.1:9000"
    
    # 1. Register a temporary user + login (keeps the test self-contained)
    test_email = f"test_api_{uuid.uuid4().hex[:8]}@example.com"
    test_username = "test_api_user"
    test_password = "password123"

    requests.post(
        f"{base_url}/auth/register",
        json={
            "username": test_username,
            "email": test_email,
            "password": test_password,
            "full_name": "API Test User",
        },
    )

    # 2. Login to get token
    print("Testing Login...")
    res = requests.post(
        f"{base_url}/auth/login",
        json={"username": test_email, "password": test_password},
    )
    if res.status_code != 200:
        print(f"Login failed: {res.status_code} {res.text}")
        return
    token = res.json().get("token")
    headers = {"Authorization": f"Bearer {token}"}
    
    # 2. Fetch farm
    farm_id = "69a983f28542a169d7f42b71"
    print(f"Testing GET /farms/{farm_id}...")
    farm_res = requests.get(f"{base_url}/farms/{farm_id}", headers=headers)
    print(f"Status: {farm_res.status_code}")
    print(f"Content: {farm_res.text}")

if __name__ == "__main__":
    test_api()
