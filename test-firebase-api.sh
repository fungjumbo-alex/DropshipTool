#!/bin/bash

# Test Firebase API endpoint
echo "Testing Firebase API..."
echo ""

FIREBASE_URL="https://dropshiptool-fungjumbo-v1.web.app"
API_ENDPOINT="${FIREBASE_URL}/api/compare"

echo "Testing with query: ipad, location: UK"
echo "URL: ${API_ENDPOINT}?query=ipad&location=UK"
echo ""

# Test the API
curl -s "${API_ENDPOINT}?query=ipad&location=UK" | jq '.debug.scraperStatus[] | {name: .name, count: .count, status: .status, error: .error}'

echo ""
echo "Full response saved to firebase-api-response.json"
curl -s "${API_ENDPOINT}?query=ipad&location=UK" > firebase-api-response.json
