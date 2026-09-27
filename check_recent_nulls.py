#!/usr/bin/env python3
"""Check if recent-dated items have v=null at far offsets."""
import requests

BASE_URL = "https://what-if-sandbox.preview.emergentagent.com"

url = f"{BASE_URL}/api/v1/analogs"
resp = requests.get(url, timeout=30)
data = resp.json()

day_fps = data.get('day_fingerprints', [])

print(f"\nChecking last 10 items for v=null at far offsets...")
print("="*80)

for item in day_fps[-10:]:
    date = item.get('date')
    fwd_path = item.get('fwd_path', [])
    
    null_offsets = [pt['off'] for pt in fwd_path if pt['v'] is None]
    
    if null_offsets:
        print(f"\nDate: {date}")
        print(f"  Null offsets: {null_offsets}")
        print(f"  Sample points:")
        for pt in fwd_path[-5:]:  # Show last 5 points
            print(f"    off={pt['off']}: v={pt['v']}")
    else:
        print(f"\nDate: {date} - All values present (no nulls)")

print("\n" + "="*80)
