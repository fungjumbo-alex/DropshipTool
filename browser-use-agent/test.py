"""
Quick test script for browser-use agent
Tests the basic functionality without starting the full server
"""

import asyncio
from agent import search_product
import json

async def test_ebay():
    """Test eBay search"""
    print("🔍 Testing eBay search for 'ipad'...")
    results = await search_product('ipad', 'ebay', 'UK')
    
    print(f"\n✅ Success: {results['success']}")
    print(f"📦 Found {len(results['results'])} products")
    
    if results['results']:
        print("\n📋 Sample result:")
        print(json.dumps(results['results'][0], indent=2))
    
    return results

async def test_facebook():
    """Test Facebook search"""
    print("\n🔍 Testing Facebook search for 'iphone'...")
    results = await search_product('iphone', 'facebook', 'UK')
    
    print(f"\n✅ Success: {results['success']}")
    print(f"📦 Found {len(results['results'])} products")
    
    if results['results']:
        print("\n📋 Sample result:")
        print(json.dumps(results['results'][0], indent=2))
    
    return results

async def main():
    print("=" * 60)
    print("Browser-Use Agent Test Suite")
    print("=" * 60)
    
    # Test eBay
    await test_ebay()
    
    # Test Facebook (uncomment if you want to test)
    # await test_facebook()
    
    print("\n" + "=" * 60)
    print("✨ Tests complete!")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(main())
