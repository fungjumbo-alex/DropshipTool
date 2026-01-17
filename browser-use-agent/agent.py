"""
Browser Use Agent for Dropship Comparator
Uses AI-powered browser automation to search for products across marketplaces
"""

import asyncio
import os
from typing import List, Dict, Any, Optional
from browser_use import Agent, Browser, ChatBrowserUse
from dotenv import load_dotenv
import json
import re

# Load environment variables
load_dotenv()

class DropshipBrowserAgent:
    """AI-powered browser agent for product searching"""
    
    def __init__(self):
        self.api_key = os.getenv('BROWSER_USE_API_KEY')
        if not self.api_key:
            raise ValueError("BROWSER_USE_API_KEY not found in environment")
    
    async def search_marketplace(
        self, 
        query: str, 
        marketplace: str, 
        location: str = 'UK',
        max_results: int = 15
    ) -> Dict[str, Any]:
        """
        Search a marketplace using AI browser automation
        
        Args:
            query: Product search query (e.g., "ipad pro")
            marketplace: Marketplace name (e.g., "ebay", "facebook", "gumtree")
            location: Location/region (e.g., "UK", "US")
            max_results: Maximum number of results to return
            
        Returns:
            Dictionary with results, url, and metadata
        """
        
        try:
            # Create browser instance
            browser = Browser(
                use_cloud=True,  # Use Browser Use Cloud for stealth browsing
            )
            
            # Create LLM instance
            llm = ChatBrowserUse()
            
            # Build the task based on marketplace
            task = self._build_task(query, marketplace, location, max_results)
            
            # Create and run agent
            agent = Agent(
                task=task,
                llm=llm,
                browser=browser,
            )
            
            history = await agent.run()
            
            # Extract results from agent history
            results = self._extract_results(history, marketplace)
            
            return {
                'results': results,
                'marketplace': marketplace,
                'query': query,
                'location': location,
                'success': True
            }
            
        except Exception as e:
            return {
                'results': [],
                'marketplace': marketplace,
                'query': query,
                'location': location,
                'success': False,
                'error': str(e)
            }
    
    def _build_task(self, query: str, marketplace: str, location: str, max_results: int) -> str:
        """Build the AI task prompt based on marketplace"""
        
        marketplace_urls = {
            'ebay': f'https://www.ebay.co.uk/sch/i.html?_nkw={query.replace(" ", "+")}' if location == 'UK' else f'https://www.ebay.com/sch/i.html?_nkw={query.replace(" ", "+")}',
            'facebook': f'https://www.facebook.com/marketplace/{location.lower()}/search?query={query.replace(" ", "%20")}',
            'gumtree': f'https://www.gumtree.com/search?search_category=all&q={query.replace(" ", "+")}',
            'backmarket': f'https://www.backmarket.co.uk/en-gb/search?q={query.replace(" ", "+")}',
            'cex': f'https://uk.webuy.com/search?stext={query.replace(" ", "+")}',
            'cashconverters': f'https://www.cashconverters.co.uk/shop/search?q={query.replace(" ", "+")}',
        }
        
        url = marketplace_urls.get(marketplace.lower(), marketplace_urls['ebay'])
        
        task = f"""
Go to {url} and extract product listings for "{query}".

For each product listing, extract:
1. Product title
2. Price (convert to numeric format, e.g., £123.45 -> 123.45)
3. Currency (GBP, USD, EUR, etc.)
4. Product link/URL
5. Image URL (if available)
6. Condition (New, Used, Refurbished, etc.)
7. Seller information (if available)

Extract up to {max_results} products.

Handle any cookie consent popups or login walls by dismissing them.

Return the data in this JSON format:
[
  {{
    "title": "Product Name",
    "price": 123.45,
    "currency": "GBP",
    "link": "https://...",
    "image": "https://...",
    "condition": "Used",
    "seller": "Seller Name"
  }}
]

Focus on actual product listings, not ads or sponsored content.
"""
        
        return task
    
    def _extract_results(self, history: Any, marketplace: str) -> List[Dict[str, Any]]:
        """Extract structured results from agent history"""
        
        results = []
        
        # Try to find JSON in the history
        history_str = str(history)
        
        # Look for JSON arrays in the response
        json_pattern = r'\[[\s\S]*?\{[\s\S]*?"title"[\s\S]*?\}[\s\S]*?\]'
        matches = re.findall(json_pattern, history_str)
        
        for match in matches:
            try:
                parsed = json.loads(match)
                if isinstance(parsed, list):
                    for item in parsed:
                        if 'title' in item and 'price' in item:
                            # Normalize the result format
                            result = {
                                'source': marketplace.title(),
                                'title': item.get('title', ''),
                                'price': float(item.get('price', 0)),
                                'currency': item.get('currency', 'GBP'),
                                'link': item.get('link', ''),
                                'image': item.get('image'),
                                'condition': item.get('condition', 'Unknown'),
                                'seller': item.get('seller')
                            }
                            results.append(result)
            except json.JSONDecodeError:
                continue
        
        return results


async def search_product(query: str, marketplace: str, location: str = 'UK') -> Dict[str, Any]:
    """
    Main function to search for products using browser-use agent
    
    Args:
        query: Product search query
        marketplace: Marketplace to search
        location: Location/region
        
    Returns:
        Search results dictionary
    """
    agent = DropshipBrowserAgent()
    return await agent.search_marketplace(query, marketplace, location)


# CLI interface for testing
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 3:
        print("Usage: python agent.py <query> <marketplace> [location]")
        print("Example: python agent.py 'ipad pro' ebay UK")
        sys.exit(1)
    
    query = sys.argv[1]
    marketplace = sys.argv[2]
    location = sys.argv[3] if len(sys.argv) > 3 else 'UK'
    
    # Run the search
    results = asyncio.run(search_product(query, marketplace, location))
    
    # Pretty print results
    print(json.dumps(results, indent=2))
