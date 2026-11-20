import requests
import uuid

def test_auth():
    base_url = "http://127.0.0.1:9000"
    
    # Test registration
    test_email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    test_username = f"testuser_{uuid.uuid4().hex[:8]}"
    test_password = "password123"
    test_full_name = "Test User"

    print("Testing Registration...")
    register_res = requests.post(
        f"{base_url}/auth/register",
        json={
            "username": test_username,
            "email": test_email,
            "password": test_password,
            "full_name": test_full_name,
        },
    )
    
    if register_res.status_code == 200:
        print("✓ Registration successful".encode('ascii', 'ignore').decode('ascii'))
        register_data = register_res.json()
        print(f"  Token: {register_data.get('token', 'None')[:20]}...")
        print(f"  User: {register_data.get('user', {}).get('username')}")
    else:
        print(f"x Registration failed: {register_res.status_code} {register_res.text}")
        return

    # Test login
    print("\nTesting Login...")
    login_res = requests.post(
        f"{base_url}/auth/login",
        json={"username": test_email, "password": test_password},
    )
    
    if login_res.status_code == 200:
        print("✓ Login successful".encode('ascii', 'ignore').decode('ascii'))
        login_data = login_res.json()
        token = login_data.get("token")
        print(f"  Token: {token[:20]}...")
        
        # Test protected endpoint
        print("\nTesting protected endpoint...")
        headers = {"Authorization": f"Bearer {token}"}
        me_res = requests.get(f"{base_url}/auth/me", headers=headers)
        
        if me_res.status_code == 200:
            print("✓ Protected endpoint access successful".encode('ascii', 'ignore').decode('ascii'))
            print(f"  User data: {me_res.json()}")
        else:
            print(f"x Protected endpoint failed: {me_res.status_code} {me_res.text}")
    else:
        print(f"x Login failed: {login_res.status_code} {login_res.text}")

if __name__ == "__main__":
    test_auth()
