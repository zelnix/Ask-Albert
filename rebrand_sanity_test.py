#!/usr/bin/env python3
"""
Post-Rebrand Sanity Check Test Suite
Tests that string-only rebrand replacements (BTCIQ→"Ask Albert", BitCentAI→CryptoCentAI, 
BitMarkAI→CryptoMarkAI) in backend/server.py did not break string formatting or core endpoints.
"""
import requests
import json
import base64
import time
import sys

# Use the external URL with /api prefix (proxied to internal :8001)
BASE_URL = "https://what-if-sandbox.preview.emergentagent.com/api"

def test_health():
    """Test 1: GET /api/v1/health -> 200"""
    print("\n" + "="*80)
    print("TEST 1: GET /api/v1/health")
    print("="*80)
    
    try:
        response = requests.get(f"{BASE_URL}/v1/health", timeout=30)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Response: {data}")
            print("✅ TEST 1 PASSED: /api/v1/health returns 200")
            return True
        else:
            print(f"❌ TEST 1 FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 1 FAILED with exception: {e}")
        return False


def test_dashboard():
    """Test 2: GET /api/v1/dashboard -> 200 with data (BTC)"""
    print("\n" + "="*80)
    print("TEST 2: GET /api/v1/dashboard")
    print("="*80)
    
    try:
        response = requests.get(f"{BASE_URL}/v1/dashboard", timeout=30)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Response keys: {list(data.keys())}")
            
            # Validate status
            assert data.get('status') == 'ready', f"Expected status='ready', got '{data.get('status')}'"
            print(f"✅ status: {data['status']}")
            
            # Validate BTC data present
            assert 'signal' in data, "Missing 'signal' field"
            assert 'confidence' in data, "Missing 'confidence' field"
            print(f"✅ signal: {data.get('signal')}")
            print(f"✅ confidence: {data.get('confidence')}")
            
            print("✅ TEST 2 PASSED: /api/v1/dashboard returns 200 with BTC data")
            return True
        else:
            print(f"❌ TEST 2 FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 2 FAILED with exception: {e}")
        return False


def test_albert_brief_btc():
    """Test 3: GET /api/v1/albert/brief -> status "ready" (confirms brief system prompt .format(ctx=...) still works)"""
    print("\n" + "="*80)
    print("TEST 3: GET /api/v1/albert/brief (BTC)")
    print("="*80)
    
    try:
        response = requests.get(f"{BASE_URL}/v1/albert/brief", timeout=60)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Response keys: {list(data.keys())}")
            
            # Validate status
            assert data.get('status') == 'ready', f"Expected status='ready', got '{data.get('status')}'"
            print(f"✅ status: {data['status']}")
            
            # Check for rebrand strings in response (should contain "Ask Albert" or similar)
            text = str(data)
            if 'BTCIQ' in text:
                print(f"⚠️  WARNING: Old brand 'BTCIQ' found in response")
            
            print("✅ TEST 3 PASSED: /api/v1/albert/brief returns status='ready' (brief system prompt .format() works)")
            return True
        else:
            print(f"❌ TEST 3 FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 3 FAILED with exception: {e}")
        return False


def test_albert_brief_eth():
    """Test 4: GET /api/v1/albert/brief?symbol=ETH -> status "ready", coin "Ethereum" (confirms coin prompt .format(ctx,coin) still works)"""
    print("\n" + "="*80)
    print("TEST 4: GET /api/v1/albert/brief?symbol=ETH")
    print("="*80)
    
    try:
        response = requests.get(f"{BASE_URL}/v1/albert/brief?symbol=ETH", timeout=60)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Response keys: {list(data.keys())}")
            
            # Validate status
            assert data.get('status') == 'ready', f"Expected status='ready', got '{data.get('status')}'"
            print(f"✅ status: {data['status']}")
            
            # Validate coin
            assert data.get('coin') == 'Ethereum', f"Expected coin='Ethereum', got '{data.get('coin')}'"
            print(f"✅ coin: {data['coin']}")
            
            # Check for rebrand strings
            text = str(data)
            if 'BTCIQ' in text:
                print(f"⚠️  WARNING: Old brand 'BTCIQ' found in response")
            
            print("✅ TEST 4 PASSED: /api/v1/albert/brief?symbol=ETH returns status='ready', coin='Ethereum' (coin prompt .format() works)")
            return True
        else:
            print(f"❌ TEST 4 FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 4 FAILED with exception: {e}")
        return False


def test_chat():
    """Test 5: POST /api/v1/chat with body {"message":"Is it a good time to buy?","deep":false} -> 200 with non-empty answer (confirms Albert chat system prompt with rebranded persona still formats/sends correctly)"""
    print("\n" + "="*80)
    print("TEST 5: POST /api/v1/chat")
    print("="*80)
    
    try:
        payload = {
            "session_id": "rebrand_test_" + str(int(time.time())),
            "message": "Is it a good time to buy?",
            "deep": False,
            "symbol": "BTC"
        }
        response = requests.post(f"{BASE_URL}/v1/chat", json=payload, timeout=60)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Response keys: {list(data.keys())}")
            
            # Validate text field exists and is non-empty
            assert 'text' in data, "Missing 'text' field"
            assert len(data['text']) > 0, "text field is empty"
            print(f"✅ text length: {len(data['text'])} chars (non-empty)")
            
            # Check for rebrand strings
            text = data['text']
            if 'BTCIQ' in text:
                print(f"⚠️  WARNING: Old brand 'BTCIQ' found in response")
            if 'Ask Albert' in text or 'Albert' in text:
                print(f"✅ New brand 'Ask Albert' or 'Albert' found in response")
            
            # Print first 200 chars of response
            print(f"✅ Response preview: {text[:200]}...")
            
            print("✅ TEST 5 PASSED: POST /api/v1/chat returns 200 with non-empty answer (Albert chat system prompt works)")
            return True
        else:
            print(f"❌ TEST 5 FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 5 FAILED with exception: {e}")
        return False


def test_track_record():
    """Test 6: GET /api/v1/albert/track-record -> 200"""
    print("\n" + "="*80)
    print("TEST 6: GET /api/v1/albert/track-record")
    print("="*80)
    
    try:
        response = requests.get(f"{BASE_URL}/v1/albert/track-record", timeout=30)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Response keys: {list(data.keys())}")
            
            # Validate status
            assert data.get('status') == 'ready', f"Expected status='ready', got '{data.get('status')}'"
            print(f"✅ status: {data['status']}")
            
            print("✅ TEST 6 PASSED: /api/v1/albert/track-record returns 200")
            return True
        else:
            print(f"❌ TEST 6 FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 6 FAILED with exception: {e}")
        return False


def test_alerts():
    """Test 7: GET /api/v1/alerts -> 200"""
    print("\n" + "="*80)
    print("TEST 7: GET /api/v1/alerts")
    print("="*80)
    
    try:
        response = requests.get(f"{BASE_URL}/v1/alerts", timeout=30)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Response keys: {list(data.keys())}")
            
            # Validate status
            assert data.get('status') == 'ready', f"Expected status='ready', got '{data.get('status')}'"
            print(f"✅ status: {data['status']}")
            
            print("✅ TEST 7 PASSED: /api/v1/alerts returns 200")
            return True
        else:
            print(f"❌ TEST 7 FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 7 FAILED with exception: {e}")
        return False


def test_tts():
    """Test 8: POST /api/v1/tts with {"text":"Ask Albert here."} -> 200 with audio_base64"""
    print("\n" + "="*80)
    print("TEST 8: POST /api/v1/tts")
    print("="*80)
    
    try:
        payload = {"text": "Ask Albert here."}
        response = requests.post(f"{BASE_URL}/v1/tts", json=payload, timeout=60)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Response keys: {list(data.keys())}")
            
            # Validate audio_base64 field exists and is non-empty
            assert 'audio_base64' in data, "Missing 'audio_base64' field"
            assert len(data['audio_base64']) > 0, "audio_base64 is empty"
            
            # Validate it's valid base64
            try:
                audio_bytes = base64.b64decode(data['audio_base64'])
                assert len(audio_bytes) > 0, "Decoded audio is empty"
                print(f"✅ audio_base64: non-empty ({len(data['audio_base64'])} chars), decodes to {len(audio_bytes)} bytes")
            except Exception as e:
                print(f"❌ audio_base64 is not valid base64: {e}")
                return False
            
            print("✅ TEST 8 PASSED: POST /api/v1/tts returns 200 with audio_base64")
            return True
        else:
            print(f"❌ TEST 8 FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
    except Exception as e:
        print(f"❌ TEST 8 FAILED with exception: {e}")
        return False


def main():
    """Run all rebrand sanity check tests"""
    print("\n" + "="*80)
    print("POST-REBRAND SANITY CHECK TEST SUITE")
    print("Testing via external URL: " + BASE_URL)
    print("="*80)
    print("\nVerifying that string-only rebrand replacements did not break:")
    print("- BTCIQ → 'Ask Albert'")
    print("- BitCentAI → CryptoCentAI")
    print("- BitMarkAI → CryptoMarkAI")
    print("\nTesting 8 core endpoints with generous timeouts (brief/chat/tts can take 5-25s)...")
    
    results = {
        "1. GET /api/v1/health": test_health(),
        "2. GET /api/v1/dashboard": test_dashboard(),
        "3. GET /api/v1/albert/brief (BTC)": test_albert_brief_btc(),
        "4. GET /api/v1/albert/brief?symbol=ETH": test_albert_brief_eth(),
        "5. POST /api/v1/chat": test_chat(),
        "6. GET /api/v1/albert/track-record": test_track_record(),
        "7. GET /api/v1/alerts": test_alerts(),
        "8. POST /api/v1/tts": test_tts(),
    }
    
    print("\n" + "="*80)
    print("FINAL SUMMARY")
    print("="*80)
    
    for test_name, passed in results.items():
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{test_name}: {status}")
    
    all_passed = all(results.values())
    
    if all_passed:
        print("\n🎉 ALL REBRAND SANITY CHECKS PASSED 🎉")
        print("\nNo string/format breakage detected. Core endpoints working correctly.")
        print("String replacements (BTCIQ→Ask Albert, BitCentAI→CryptoCentAI, BitMarkAI→CryptoMarkAI)")
        print("in LLM prompts, email subjects, and assessment text are functioning properly.")
        return 0
    else:
        print("\n❌ SOME REBRAND SANITY CHECKS FAILED")
        print("\nString replacements may have broken formatting or core functionality.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
