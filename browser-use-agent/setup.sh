#!/bin/bash

echo "🚀 Setting up Browser-Use Agent for Dropship Comparator"
echo ""

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.11 or higher."
    exit 1
fi

echo "✅ Python found: $(python3 --version)"
echo ""

# Navigate to browser-use-agent directory
cd "$(dirname "$0")"

# Check if uv is installed
if command -v uv &> /dev/null; then
    echo "✅ uv found, using uv for installation"
    echo ""
    
    # Create virtual environment
    echo "📦 Creating virtual environment..."
    uv venv
    
    # Activate virtual environment
    source .venv/bin/activate
    
    # Install dependencies
    echo "📥 Installing dependencies..."
    uv pip install -r requirements.txt
    
else
    echo "⚠️  uv not found, using pip"
    echo "   (Install uv for faster installs: curl -LsSf https://astral.sh/uv/install.sh | sh)"
    echo ""
    
    # Create virtual environment
    echo "📦 Creating virtual environment..."
    python3 -m venv .venv
    
    # Activate virtual environment
    source .venv/bin/activate
    
    # Upgrade pip
    pip install --upgrade pip
    
    # Install dependencies
    echo "📥 Installing dependencies..."
    pip install -r requirements.txt
fi

# Install Chromium browser
echo ""
echo "🌐 Installing Chromium browser..."
uvx browser-use install || python -m browser_use install

# Check if .env exists
if [ ! -f .env ]; then
    echo ""
    echo "⚠️  .env file not found!"
    echo "Please create .env with your BROWSER_USE_API_KEY"
else
    echo ""
    echo "✅ .env file found"
fi

echo ""
echo "✨ Setup complete!"
echo ""
echo "To start the browser-use server:"
echo "  cd browser-use-agent"
echo "  source .venv/bin/activate"
echo "  python server.py"
echo ""
echo "Or test the agent directly:"
echo "  python agent.py 'ipad pro' ebay UK"
echo ""
