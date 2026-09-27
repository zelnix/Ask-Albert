#!/usr/bin/env python3
"""
Test Yahoo Finance BTC-USD with date-bounded period1/period2 parameters.
Read-only verification to determine if daily data is available for pre-2021 periods.
"""

import requests
from datetime import datetime, timezone
import statistics
import time

def unix_timestamp(date_str):
    """Convert YYYY-MM-DD to UNIX timestamp."""
    dt = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    return int(dt.timestamp())

def test_period_window(start_date, end_date, window_name):
    """Test a specific date window with period1/period2 parameters."""
    print(f"\n{'='*80}")
    print(f"TEST: {window_name}")
    print(f"{'='*80}")
    
    period1 = unix_timestamp(start_date)
    period2 = unix_timestamp(end_date)
    
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD"
    params = {
        'interval': '1d',
        'period1': period1,
        'period2': period2
    }
    
    print(f"URL: {url}")
    print(f"Parameters: interval=1d, period1={period1} ({start_date}), period2={period2} ({end_date})")
    
    # Add headers to look like a browser request
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
    }
    
    try:
        response = requests.get(url, params=params, headers=headers, timeout=30)
        print(f"HTTP Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ ERROR: Non-200 status code")
            print(f"Response body: {response.text[:500]}")
            return
        
        data = response.json()
        
        # Debug: print response structure
        print(f"Response keys: {data.keys()}")
        if 'chart' in data:
            print(f"Chart keys: {data['chart'].keys()}")
        
        # Check for errors in response
        if 'chart' not in data:
            print(f"❌ ERROR: No 'chart' key in response")
            print(f"Response: {data}")
            return
            
        if 'error' in data['chart'] and data['chart']['error'] is not None:
            error = data['chart']['error']
            print(f"❌ API ERROR: {error}")
            return
        
        if 'result' not in data['chart'] or not data['chart']['result']:
            print(f"❌ ERROR: No result in chart")
            print(f"Chart data: {data['chart']}")
            return
        
        result = data['chart']['result'][0]
        timestamps = result['timestamp']
        indicators = result['indicators']['quote'][0]
        closes = indicators['close']
        volumes = indicators['volume']
        
        # Filter out None values and get closed observations
        valid_data = [(ts, c, v) for ts, c, v in zip(timestamps, closes, volumes) if c is not None]
        
        if not valid_data:
            print(f"❌ NO VALID DATA: All close prices are None")
            return
        
        # Exclude today's forming candle (last observation)
        closed_data = valid_data[:-1] if len(valid_data) > 1 else valid_data
        
        print(f"\nOBSERVATIONS:")
        print(f"• Total observations (including today's forming candle): {len(valid_data)}")
        print(f"• Closed observations (excluding today): {len(closed_data)}")
        
        if not closed_data:
            print(f"❌ NO CLOSED DATA")
            return
        
        # Get first and last
        first_ts, first_close, first_vol = closed_data[0]
        last_ts, last_close, last_vol = closed_data[-1]
        
        first_date = datetime.fromtimestamp(first_ts, tz=timezone.utc).strftime('%Y-%m-%d')
        last_date = datetime.fromtimestamp(last_ts, tz=timezone.utc).strftime('%Y-%m-%d')
        
        print(f"\nDATE RANGE:")
        print(f"• First date: {first_date}")
        print(f"• Last date: {last_date}")
        
        # Calculate time span
        first_dt = datetime.fromtimestamp(first_ts, tz=timezone.utc)
        last_dt = datetime.fromtimestamp(last_ts, tz=timezone.utc)
        days_span = (last_dt - first_dt).days
        years_span = days_span / 365.25
        
        print(f"• Calendar days span: {days_span} days")
        print(f"• Years span: {years_span:.2f} years")
        
        print(f"\nCLOSE PRICES:")
        print(f"• First close ({first_date}): ${first_close:,.2f}")
        print(f"• Last close ({last_date}): ${last_close:,.2f}")
        
        # Calculate gaps between consecutive timestamps
        gaps_days = []
        for i in range(1, len(closed_data)):
            prev_ts = closed_data[i-1][0]
            curr_ts = closed_data[i][0]
            gap_seconds = curr_ts - prev_ts
            gap_days = gap_seconds / 86400  # Convert to days
            gaps_days.append(gap_days)
        
        if gaps_days:
            median_gap = statistics.median(gaps_days)
            min_gap = min(gaps_days)
            max_gap = max(gaps_days)
            
            print(f"\nTIMESTAMP SPACING (CADENCE):")
            print(f"• Median gap: {median_gap:.2f} days")
            print(f"• Min gap: {min_gap:.2f} days")
            print(f"• Max gap: {max_gap:.2f} days")
            
            # Determine if daily or monthly
            if median_gap < 2:
                print(f"✅ DAILY DATA: Median gap < 2 days indicates daily observations")
                granularity = "DAILY"
            elif 25 <= median_gap <= 35:
                print(f"⚠️  MONTHLY DATA: Median gap ~30 days indicates monthly observations")
                granularity = "MONTHLY"
            else:
                print(f"⚠️  UNKNOWN GRANULARITY: Median gap {median_gap:.2f} days")
                granularity = "UNKNOWN"
        else:
            print(f"⚠️  Cannot calculate gaps (only 1 observation)")
            granularity = "UNKNOWN"
        
        # Show sample data
        print(f"\nSAMPLE DATA (first 3 observations):")
        for i in range(min(3, len(closed_data))):
            ts, close, vol = closed_data[i]
            date = datetime.fromtimestamp(ts, tz=timezone.utc).strftime('%Y-%m-%d')
            print(f"• {date}: ${close:,.2f} (volume: {vol:,.0f})")
        
        print(f"\nSAMPLE DATA (last 3 observations):")
        for i in range(max(0, len(closed_data) - 3), len(closed_data)):
            ts, close, vol = closed_data[i]
            date = datetime.fromtimestamp(ts, tz=timezone.utc).strftime('%Y-%m-%d')
            print(f"• {date}: ${close:,.2f} (volume: {vol:,.0f})")
        
        # Summary
        print(f"\n{'='*80}")
        print(f"SUMMARY FOR {window_name}:")
        print(f"{'='*80}")
        print(f"• HTTP Status: {response.status_code} ✅")
        print(f"• Closed observations: {len(closed_data)}")
        print(f"• Date range: {first_date} to {last_date}")
        print(f"• Median gap: {median_gap:.2f} days" if gaps_days else "• Median gap: N/A")
        print(f"• Granularity: {granularity}")
        print(f"• First close: ${first_close:,.2f}")
        print(f"• Last close: ${last_close:,.2f}")
        
    except requests.exceptions.RequestException as e:
        print(f"❌ REQUEST ERROR: {e}")
    except Exception as e:
        print(f"❌ UNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()

def main():
    print("="*80)
    print("YAHOO FINANCE BTC-USD DATE-BOUNDED PERIOD TEST")
    print("="*80)
    print("Testing whether period1/period2 parameters can retrieve daily data for pre-2021 periods")
    print("Endpoint: query1.finance.yahoo.com/v8/finance/chart/BTC-USD")
    print("Method: interval=1d with UNIX timestamp bounds")
    print("="*80)
    
    # Test Window 1: 2015-01-01 to 2018-01-01 (3 years)
    print("\nWaiting 5 seconds before first request to avoid rate limiting...")
    time.sleep(5)
    test_period_window("2015-01-01", "2018-01-01", "Window 1: 2015-01-01 to 2018-01-01")
    
    # Test Window 2: 2018-01-01 to 2021-01-01 (3 years)
    print("\nWaiting 10 seconds before second request to avoid rate limiting...")
    time.sleep(10)
    test_period_window("2018-01-01", "2021-01-01", "Window 2: 2018-01-01 to 2021-01-01")
    
    print("\n" + "="*80)
    print("FINAL CONCLUSION")
    print("="*80)
    print("If both windows returned DAILY data (median gap < 2 days):")
    print("  ✅ Yahoo Finance CAN provide pre-2021 daily BTC-USD data via period1/period2")
    print("  ✅ Existing provider can fulfill the spec by using date-bounded queries")
    print("\nIf either window returned MONTHLY data (median gap ~30 days):")
    print("  ❌ Yahoo Finance CANNOT provide pre-2021 daily data")
    print("  ❌ Need alternative provider or accept 5-year daily limit")
    print("="*80)

if __name__ == "__main__":
    main()
