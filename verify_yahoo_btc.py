#!/usr/bin/env python3
"""
READ-ONLY verification of real Yahoo Finance BTC-USD data availability.
Tests both rng='max' and rng='5y' to determine actual row counts and date ranges.
"""
import sys
import datetime
import requests
import time
from datetime import timezone

def fetch_yahoo_observations(symbol, rng):
    """Fetch observations from Yahoo Finance (mimics fetch_yahoo_series with observations=True)"""
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range={rng}'
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    try:
        response = requests.get(url, headers=headers, timeout=30)
        print(f"\n{'='*80}")
        print(f"Testing: {symbol} with range={rng}")
        print(f"URL: {url}")
        print(f"HTTP Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"ERROR: HTTP {response.status_code}")
            print(f"Response text: {response.text[:500]}")
            return None
        
        data = response.json()
        
        # Check for errors in response
        if 'chart' not in data or 'result' not in data['chart']:
            print(f"ERROR: Unexpected response structure")
            print(f"Response keys: {data.keys()}")
            return None
        
        if not data['chart']['result']:
            print(f"ERROR: Empty result array")
            if 'error' in data['chart']:
                print(f"Yahoo error: {data['chart']['error']}")
            return None
        
        result = data['chart']['result'][0]
        timestamps = result.get('timestamp', [])
        quote = result['indicators']['quote'][0]
        closes = quote.get('close', [])
        volumes = quote.get('volume', [])
        
        # Build observations list
        observations = []
        for i, (ts, close) in enumerate(zip(timestamps, closes)):
            if close is not None:  # Skip None closes
                date_str = datetime.datetime.utcfromtimestamp(ts).strftime('%Y-%m-%d')
                volume = volumes[i] if i < len(volumes) else None
                observations.append({
                    'date': date_str,
                    'close': close,
                    'volume': volume
                })
        
        # Filter out today's forming candle
        today = datetime.datetime.now(timezone.utc).date().isoformat()
        closed_obs = [o for o in observations if o['date'] < today]
        
        print(f"\n✅ SUCCESS")
        print(f"Total observations (including today): {len(observations)}")
        print(f"Closed observations (excluding today): {len(closed_obs)}")
        
        if closed_obs:
            first_date = closed_obs[0]['date']
            last_date = closed_obs[-1]['date']
            first_close = closed_obs[0]['close']
            last_close = closed_obs[-1]['close']
            
            print(f"\nFirst observation:")
            print(f"  Date: {first_date}")
            print(f"  Close: ${first_close:,.2f}")
            print(f"  Valid: {first_close > 0}")
            
            print(f"\nLast observation:")
            print(f"  Date: {last_date}")
            print(f"  Close: ${last_close:,.2f}")
            print(f"  Valid: {last_close > 0}")
            
            # Calculate span
            first_dt = datetime.datetime.fromisoformat(first_date)
            last_dt = datetime.datetime.fromisoformat(last_date)
            span_days = (last_dt - first_dt).days
            span_years = span_days / 365.25
            
            print(f"\nDate span:")
            print(f"  Calendar days: {span_days}")
            print(f"  Years: {span_years:.2f}")
            print(f"  Shorter than 5 years: {span_years < 5}")
            
            # Check for implicit cap
            if rng == 'max' and len(closed_obs) < 1000:
                print(f"\n⚠️  WARNING: rng='max' returned only {len(closed_obs)} observations")
                print(f"    This suggests an implicit cap or data limitation")
            
            # Sample a few observations to verify data quality
            print(f"\nSample observations (first 3):")
            for obs in closed_obs[:3]:
                print(f"  {obs['date']}: ${obs['close']:,.2f} (volume: {obs['volume']})")
            
            print(f"\nSample observations (last 3):")
            for obs in closed_obs[-3:]:
                print(f"  {obs['date']}: ${obs['close']:,.2f} (volume: {obs['volume']})")
        else:
            print(f"\n❌ ERROR: No closed observations found")
        
        return closed_obs
        
    except requests.exceptions.RequestException as e:
        print(f"\n❌ HTTP ERROR: {type(e).__name__}: {e}")
        return None
    except KeyError as e:
        print(f"\n❌ PARSE ERROR: Missing key {e}")
        print(f"Response structure: {data.keys() if 'data' in locals() else 'N/A'}")
        return None
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return None


def main():
    print("="*80)
    print("YAHOO FINANCE BTC-USD DATA AVAILABILITY VERIFICATION")
    print("="*80)
    print(f"Timestamp: {datetime.datetime.now(timezone.utc).isoformat()}")
    
    # Test 1: rng='max'
    max_obs = fetch_yahoo_observations('BTC-USD', 'max')
    
    # Wait between requests to avoid rate limiting
    if max_obs is not None:
        print("\nWaiting 5 seconds before next request to avoid rate limiting...")
        time.sleep(5)
    
    # Test 2: rng='5y'
    five_y_obs = fetch_yahoo_observations('BTC-USD', '5y')
    
    # Comparison
    print(f"\n{'='*80}")
    print("COMPARISON SUMMARY")
    print(f"{'='*80}")
    
    if max_obs is not None and five_y_obs is not None:
        print(f"\nrng='max':  {len(max_obs)} observations")
        print(f"rng='5y':   {len(five_y_obs)} observations")
        print(f"\nDifference: {len(max_obs) - len(five_y_obs)} observations")
        
        if len(max_obs) <= len(five_y_obs):
            print(f"\n⚠️  FINDING: rng='max' returns SAME OR FEWER observations than rng='5y'")
            print(f"    This indicates Yahoo Finance has an implicit cap on BTC-USD history")
        else:
            print(f"\n✅ rng='max' returns MORE observations than rng='5y' as expected")
        
        # Check if either meets minimum threshold
        MIN_OBSERVATIONS = 180
        print(f"\nMinimum required observations: {MIN_OBSERVATIONS}")
        print(f"rng='max' meets minimum: {len(max_obs) >= MIN_OBSERVATIONS}")
        print(f"rng='5y' meets minimum: {len(five_y_obs) >= MIN_OBSERVATIONS}")
        
        if len(max_obs) < MIN_OBSERVATIONS:
            print(f"\n❌ BLOCKER: rng='max' returns only {len(max_obs)} observations")
            print(f"    This is below the {MIN_OBSERVATIONS} threshold required for Phase C/D")
            print(f"    User needs to approve a different licensed history source/credential")
    elif max_obs is None and five_y_obs is None:
        print(f"\n❌ BOTH REQUESTS FAILED")
        print(f"    Yahoo Finance provider is unavailable or blocked")
    elif max_obs is None:
        print(f"\n❌ rng='max' FAILED but rng='5y' returned {len(five_y_obs)} observations")
    elif five_y_obs is None:
        print(f"\n❌ rng='5y' FAILED but rng='max' returned {len(max_obs)} observations")
    
    print(f"\n{'='*80}")
    print("VERIFICATION COMPLETE")
    print(f"{'='*80}\n")


if __name__ == '__main__':
    main()
