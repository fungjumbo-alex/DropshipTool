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
            'cashconverters': f'https://www.cashconverters.co.uk/search-results?query={query.replace(" ", "+")}',
            'kelkoo': f'https://www.kelkoo.co.uk/search?query={query.replace(" ", "+")}',
        }
        
        url = marketplace_urls.get(marketplace.lower(), marketplace_urls['ebay'])
        
        task = f"""
Go to {url} and extract product listings for "{query}".

IMPORTANT:
1. If you encounter a "Just a moment..." or "Checking your browser" page (Cloudflare), wait for it to finish. Do not give up.
2. For Back Market, look for items in the search results grid. Product links typically contain "/p/" or "/en-gb/p/".
3. For Cash Converters, look for items with class ".product-item".
4. For Kelkoo, handle the privacy "AGREE" button and look for product cards with class "group".

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
        history_str = ""
        
        # 1. Try to get result from final_result() if available
        try:
            if hasattr(history, 'final_result') and history.final_result():
                res_obj = history.final_result()
                history_str += str(res_obj)
        except:
            pass
            
        # 2. Add full history string as fallback
        history_str += "\n" + str(history)
        
        # 3. Clean up escaped characters if they exist
        if '\\"' in history_str:
            # Try to unescape
            try:
                # Replace escaped quotes with regular quotes for easier regex matching
                history_str = history_str.replace('\\"', '"').replace('\\n', '\n')
            except:
                pass
        
        # 4. Look for JSON arrays in the response
        # Improved regex to find any JSON-like list of objects
        json_pattern = r'\[\s*\{[\s\S]*?\}\s*\]'
        matches = re.findall(json_pattern, history_str)
        
        # Sort matches by length (prefer longer ones as they likely contain more data)
        matches.sort(key=len, reverse=True)
        
        for match in matches:
            try:
                # Basic cleanup of Common AI formatting markers
                clean_match = match.strip()
                parsed = json.loads(clean_match)
                if isinstance(parsed, list):
                    for item in parsed:
                        if not isinstance(item, dict):
                            continue
                            
                        # Intelligent key mapping (AI often uses varied names)
                        title = item.get('title') or item.get('Product title') or item.get('name', 'Unknown Product')
                        price_val = item.get('price') or item.get('Price') or 0
                        
                        # Convert price to float if it's a string
                        if isinstance(price_val, str):
                            try:
                                # Remove currency symbols and commas
                                price_val = re.sub(r'[^\d.]', '', price_val)
                                price_val = float(price_val) if price_val else 0
                            except:
                                price_val = 0
                        
                        currency = item.get('currency') or item.get('Currency') or ('GBP' if '£' in str(item) else 'USD')
                        link = item.get('link') or item.get('Product link') or item.get('url') or ''
                        image = item.get('image') or item.get('Image URL') or item.get('image_url')
                        condition = item.get('condition') or item.get('Condition') or 'Unknown'
                        seller = item.get('seller') or item.get('Seller') or item.get('Seller information')
                        
                        if title and title != 'Unknown Product':
                            results.append({
                                'source': marketplace.title(),
                                'title': str(title).strip(),
                                'price': float(price_val),
                                'currency': str(currency),
                                'link': str(link).strip(),
                                'image': str(image).strip() if image else None,
                                'condition': str(condition).strip(),
                                'seller': str(seller).strip() if seller else None
                            })
                    
                    # If we found valid results in this match, we can stop
                    if results:
                        break
            except Exception as e:
                print(f"Error parsing JSON match: {e}")
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
