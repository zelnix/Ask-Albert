#!/usr/bin/env python3
"""
READ-ONLY Backend API Regression Smoke Test
Tests /api/auth/me and /api/v1/albert/state-of-play through Next.js proxy
Using existing seeded session token from memory/test_credentials.md
"""

import requests
import json
from datetime import datetime

# Configuration from .env and test_credentials.md
BASE_URL = "https://what-if-sandbox.preview.emergentagent.com"
SESSION_TOKEN = "sop_e2e_session_token_0001"
HEADERS_AUTH = {
    "Authorization": f"Bearer {SESSION_TOKEN}",
    "Content-Type": "application/json"
}

def print_section(title):
    print(f"\n{'='*80}")
    print(f"  {title}")
    print(f"{'='*80}\n")

def test_auth_me_authorized():
    """Test GET /api/auth/me with valid Bearer token"""
    print_section("TEST 1: GET /api/auth/me (Authorized)")
    
    url = f"{BASE_URL}/api/auth/me"
    print(f"URL: {url}")
    print(f"Headers: Authorization: Bearer {SESSION_TOKEN[:20]}...")
    
    try:
        response = requests.get(url, headers=HEADERS_AUTH, timeout=30)
        print(f"\nStatus Code: {response.status_code}")
        print(f"Response Headers: {dict(response.headers)}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"\n✅ SUCCESS - Authenticated user data received:")
            print(json.dumps(data, indent=2))
            return True, data
        elif response.status_code == 500:
            print(f"\n⚠️  WARNING - 500 Internal Server Error (may be intermittent per spec)")
            print(f"Response: {response.text[:500]}")
            return False, {"error": "500", "text": response.text[:500]}
        else:
            print(f"\n❌ UNEXPECTED STATUS: {response.status_code}")
            print(f"Response: {response.text[:500]}")
            return False, {"error": response.status_code, "text": response.text[:500]}
            
    except Exception as e:
        print(f"\n❌ EXCEPTION: {str(e)}")
        return False, {"error": "exception", "message": str(e)}

def test_auth_me_unauthorized():
    """Test GET /api/auth/me without Bearer token (optional)"""
    print_section("TEST 2: GET /api/auth/me (Unauthorized - Optional)")
    
    url = f"{BASE_URL}/api/auth/me"
    print(f"URL: {url}")
    print(f"Headers: None (no Authorization)")
    
    try:
        response = requests.get(url, timeout=30)
        print(f"\nStatus Code: {response.status_code}")
        
        if response.status_code == 401:
            print(f"\n✅ EXPECTED - 401 Unauthorized")
            print(f"Response: {response.text[:200]}")
            return True, {"status": 401}
        else:
            print(f"\n⚠️  UNEXPECTED STATUS: {response.status_code}")
            print(f"Response: {response.text[:500]}")
            return False, {"error": response.status_code, "text": response.text[:500]}
            
    except Exception as e:
        print(f"\n❌ EXCEPTION: {str(e)}")
        return False, {"error": "exception", "message": str(e)}

def test_state_of_play():
    """Test GET /api/v1/albert/state-of-play with valid Bearer token"""
    print_section("TEST 3: GET /api/v1/albert/state-of-play (Authorized)")
    
    url = f"{BASE_URL}/api/v1/albert/state-of-play"
    print(f"URL: {url}")
    print(f"Headers: Authorization: Bearer {SESSION_TOKEN[:20]}...")
    
    try:
        response = requests.get(url, headers=HEADERS_AUTH, timeout=30)
        print(f"\nStatus Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"\n✅ SUCCESS - State-of-play data received")
            print(f"Response keys: {list(data.keys())}")
            
            # Print summary of key fields
            if 'stateId' in data:
                print(f"  stateId: {data['stateId']}")
            if 'generatedAt' in data:
                print(f"  generatedAt: {data['generatedAt']}")
            if 'user' in data:
                print(f"  user keys: {list(data['user'].keys()) if isinstance(data['user'], dict) else 'N/A'}")
            if 'market' in data:
                print(f"  market keys: {list(data['market'].keys()) if isinstance(data['market'], dict) else 'N/A'}")
            if 'portfolio' in data:
                print(f"  portfolio keys: {list(data['portfolio'].keys()) if isinstance(data['portfolio'], dict) else 'N/A'}")
            
            # Full response (truncated for readability)
            response_str = json.dumps(data, indent=2)
            if len(response_str) > 2000:
                print(f"\nFull response (first 2000 chars):\n{response_str[:2000]}...")
            else:
                print(f"\nFull response:\n{response_str}")
            
            return True, data
        elif response.status_code == 500:
            print(f"\n⚠️  WARNING - 500 Internal Server Error")
            print(f"Response: {response.text[:500]}")
            return False, {"error": "500", "text": response.text[:500]}
        else:
            print(f"\n❌ UNEXPECTED STATUS: {response.status_code}")
            print(f"Response: {response.text[:500]}")
            return False, {"error": response.status_code, "text": response.text[:500]}
            
    except Exception as e:
        print(f"\n❌ EXCEPTION: {str(e)}")
        return False, {"error": "exception", "message": str(e)}

def main():
    print_section("Backend API Regression Smoke Test")
    print(f"Timestamp: {datetime.utcnow().isoformat()}Z")
    print(f"Base URL: {BASE_URL}")
    print(f"Session Token: {SESSION_TOKEN[:20]}... (from memory/test_credentials.md)")
    print(f"\nScope: READ-ONLY preview/local smoke test")
    print(f"NOT testing production 520 issue (deployment scope unavailable)")
    
    results = {}
    
    # Test 1: /api/auth/me (authorized)
    success1, data1 = test_auth_me_authorized()
    results['auth_me_authorized'] = {'success': success1, 'data': data1}
    
    # Test 2: /api/auth/me (unauthorized) - optional
    success2, data2 = test_auth_me_unauthorized()
    results['auth_me_unauthorized'] = {'success': success2, 'data': data2}
    
    # Test 3: /api/v1/albert/state-of-play (authorized)
    success3, data3 = test_state_of_play()
    results['state_of_play'] = {'success': success3, 'data': data3}
    
    # Summary
    print_section("TEST SUMMARY")
    print(f"Test 1 - /api/auth/me (authorized):     {'✅ PASS' if success1 else '❌ FAIL'}")
    print(f"Test 2 - /api/auth/me (unauthorized):   {'✅ PASS' if success2 else '❌ FAIL'} (optional)")
    print(f"Test 3 - /api/v1/albert/state-of-play: {'✅ PASS' if success3 else '❌ FAIL'}")
    
    total_critical = 2  # Tests 1 and 3 are critical
    passed_critical = sum([success1, success3])
    
    print(f"\nCritical Tests: {passed_critical}/{total_critical} passed")
    
    if passed_critical == total_critical:
        print("\n✅ ALL CRITICAL TESTS PASSED")
        print("Preview Next.js /api proxy and backend authentication working correctly.")
    else:
        print("\n❌ SOME CRITICAL TESTS FAILED")
        print("See details above for specific failures.")
    
    print("\n" + "="*80)
    print("NOTE: This is a preview/local smoke test only.")
    print("Production Cloudflare 520 issue remains UNVERIFIED and NOT fixed.")
    print("Deployer_agent reported 'v3 deployment not found' - deployment scope unavailable.")
    print("="*80 + "\n")
    
    return results

if __name__ == "__main__":
    main()
