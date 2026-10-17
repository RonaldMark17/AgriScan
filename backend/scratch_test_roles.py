import sys
import json
import urllib.request
import urllib.error
import pyotp
import sqlite3
from app.core.security import decrypt_secret

BASE_URL = "http://127.0.0.1:8000/api/v1"

def make_request(endpoint, method="GET", data=None, token=None):
    url = f"{BASE_URL}{endpoint}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read().decode("utf-8")
            return resp.status, json.loads(content) if content else {}
    except urllib.error.HTTPError as e:
        content = e.read().decode("utf-8")
        try:
            parsed = json.loads(content)
        except Exception:
            parsed = {"raw": content}
        return e.code, parsed
    except Exception as e:
        return 0, {"error": str(e)}

def run_tests():
    print("=" * 60)
    print("AGRISCAN FULL SYSTEM & ROLE AUDIT")
    print("=" * 60)
    
    # -------------------------------------------------------------
    # TEST 1: FARMER ROLE WORKFLOW
    # -------------------------------------------------------------
    print("\n[TEST 1] Testing Farmer Role: farmer@agriscanproject.com")
    status, login_res = make_request("/auth/login", method="POST", data={
        "email": "farmer@agriscanproject.com",
        "password": "ChangeMe!2026Secure"
    })
    print(f"  Farmer Login Status: {status}")
    if status != 200:
        print(f"  FAILED to login as farmer: {login_res}")
        return
    
    farmer_token = login_res.get("access_token")
    print(f"  Farmer token received: {farmer_token[:20]}...")
    
    # Check Profile
    status, me = make_request("/auth/me", token=farmer_token)
    print(f"  GET /auth/me: Status {status}, Role: {me.get('role')}, Name: {me.get('full_name')}")
    farmer_role = me.get("role", {}).get("name") if isinstance(me.get("role"), dict) else me.get("role")
    assert farmer_role == "farmer", f"Expected role 'farmer', got {farmer_role}"

    # Check Farmer Pages/Endpoints
    endpoints_to_check = [
        ("/farms", "Farms List"),
        ("/scans", "Disease Scans"),
        ("/predictions", "Crop Predictions"),
        ("/notifications", "Notifications Inbox"),
        ("/reports/monthly", "Monthly Report"),
        ("/account/status", "Account Status"),
        ("/users/devices", "Login Devices History"),
    ]
    for ep, name in endpoints_to_check:
        st, res = make_request(ep, token=farmer_token)
        count = len(res) if isinstance(res, list) else ("dict" if isinstance(res, dict) else "other")
        print(f"  Farmer {name} ({ep}): Status {st} (payload: {count})")
        assert st == 200, f"Farmer should have access to {ep}"

    # Test Soil Scan recommendation (Manual Scan page)
    st, soil_res = make_request("/predictions/soil-scan", method="POST", token=farmer_token, data={
        "soil_type": "Loam",
        "ph_level": 6.5,
        "moisture_percent": 45,
        "soil_temperature_c": 28,
        "nitrogen_level": "medium",
        "phosphorus_level": "medium",
        "potassium_level": "medium",
        "drainage": "moderate",
        "sunlight": "full sun",
        "season": "regular season",
        "province": "Laguna"
    })
    print(f"  Farmer Manual Soil Scan (/predictions/soil-scan): Status {st}, Best Crop: {soil_res.get('best_crop')}")

    # Farmer Permission Boundary Check (Admin routes should be FORBIDDEN 403)
    admin_endpoints_for_farmer = [
        "/users",
        "/admin/activity-logs",
        "/admin/account-security-summary",
        "/admin/farm-approvals",
        "/admin/appeals",
        "/admin/flagged-reviews",
    ]
    print("\n  Verifying Farmer Security Boundaries (Should be 403 Forbidden):")
    for ep in admin_endpoints_for_farmer:
        st, res = make_request(ep, token=farmer_token)
        is_blocked = (st == 403)
        print(f"    Farmer -> {ep}: Status {st} {'[PASS: Protected]' if is_blocked else '[FAIL: Security Leak]'}")
        assert is_blocked, f"Farmer should NOT have access to {ep}"

    # -------------------------------------------------------------
    # TEST 2: ADMIN ROLE WORKFLOW
    # -------------------------------------------------------------
    print("\n[TEST 2] Testing Admin Role: admin@agriscanproject.com")
    status, login_res = make_request("/auth/login", method="POST", data={
        "email": "admin@agriscanproject.com",
        "password": "ChangeMe!2026Secure"
    })
    print(f"  Admin Login Status Code: {status}, Response Status: {login_res.get('status')}")
    assert login_res.get("status") == "mfa_required", f"Admin must require MFA: {login_res}"
    
    temp_token = login_res.get("mfa_token")
    
    # Retrieve MFA secret from DB and generate code
    conn = sqlite3.connect(r"data\agriscan.sqlite3")
    cursor = conn.cursor()
    cursor.execute("SELECT secret_encrypted FROM mfa_settings WHERE user_id = 1")
    secret = decrypt_secret(cursor.fetchone()[0])
    totp = pyotp.TOTP(secret)
    current_code = totp.now()
    print(f"  Generated current TOTP code: {current_code}")

    # Submit MFA Challenge
    status, mfa_res = make_request("/auth/mfa/verify", method="POST", data={
        "mfa_token": temp_token,
        "code": current_code
    })
    print(f"  MFA Challenge Status: {status}")
    assert status == 200, f"MFA Challenge failed: {mfa_res}"
    admin_token = mfa_res.get("access_token")

    # Check Admin Profile
    status, admin_me = make_request("/auth/me", token=admin_token)
    print(f"  GET /auth/me: Status {status}, Role: {admin_me.get('role')}, Name: {admin_me.get('full_name')}")
    admin_role = admin_me.get("role", {}).get("name") if isinstance(admin_me.get("role"), dict) else admin_me.get("role")
    assert admin_role == "admin", f"Expected role 'admin', got {admin_role}"

    # Check Admin Pages/Endpoints
    admin_pages = [
        ("/dashboard/summary", "Admin Dashboard Summary"),
        ("/users", "User Management"),
        ("/admin/activity-logs", "Audit Logs"),
        ("/admin/account-security-summary", "Security Summary"),
        ("/admin/farm-approvals", "Farm Review Queue"),
        ("/admin/appeals", "Suspension Appeals"),
        ("/admin/flagged-reviews", "Flagged Crop Reviews"),
        ("/reports/monthly", "Monthly Reports"),
        ("/farms", "All Registered Farms"),
        ("/scans", "All Crop Scans"),
        ("/predictions", "All Predictions"),
    ]
    print("\n  Verifying Admin Endpoints:")
    for ep, name in admin_pages:
        st, res = make_request(ep, token=admin_token)
        count = len(res) if isinstance(res, list) else ("dict" if isinstance(res, dict) else "other")
        print(f"    Admin {name} ({ep}): Status {st} (payload: {count})")
        assert st == 200, f"Admin should have access to {ep}"

    print("\n" + "=" * 60)
    print("ALL TEST RUNS COMPLETED SUCCESSFULLY WITH ZERO SECURITY LEAKS.")
    print("=" * 60)

if __name__ == "__main__":
    run_tests()
