"""
FastAPI server for Browser Use Agent
Provides HTTP API for AI-powered product searching
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import asyncio
from agent import search_product

app = FastAPI(
    title="Browser Use Agent API",
    description="AI-powered product search using browser automation",
    version="1.0.0"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SearchRequest(BaseModel):
    query: str
    marketplace: str
    location: Optional[str] = 'UK'
    max_results: Optional[int] = 15

class SearchResponse(BaseModel):
    results: list
    marketplace: str
    query: str
    location: str
    success: bool
    error: Optional[str] = None

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "online",
        "service": "Browser Use Agent API",
        "version": "1.0.0"
    }

@app.post("/search", response_model=SearchResponse)
async def search(request: SearchRequest):
    """
    Search for products using AI browser automation
    
    Args:
        request: SearchRequest with query, marketplace, and location
        
    Returns:
        SearchResponse with product results
    """
    try:
        results = await search_product(
            query=request.query,
            marketplace=request.marketplace,
            location=request.location
        )
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/search/{marketplace}")
async def search_get(
    marketplace: str,
    query: str,
    location: str = 'UK'
):
    """
    GET endpoint for searching (alternative to POST)
    
    Args:
        marketplace: Marketplace to search
        query: Product search query
        location: Location/region
        
    Returns:
        Search results
    """
    try:
        results = await search_product(
            query=query,
            marketplace=marketplace,
            location=location
        )
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
