#!/bin/bash
# TextAile Start Script
# Handles dependency installation and starts both backend and frontend

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting TextAile...${NC}"

# Backend setup
echo -e "${YELLOW}Setting up backend...${NC}"
cd backend

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install/update dependencies
echo "Installing Python dependencies..."
pip install -r requirements.txt -q

# Start backend in background
echo -e "${GREEN}Starting backend on port 8001...${NC}"
uvicorn app.main:app --host 0.0.0.0 --port 8001 &
BACKEND_PID=$!

cd "$SCRIPT_DIR"

# Frontend setup
echo -e "${YELLOW}Setting up frontend...${NC}"
cd frontend

# Install dependencies if node_modules doesn't exist or package.json changed
if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

# Start frontend
echo -e "${GREEN}Starting frontend on port 5174...${NC}"
npm run dev &
FRONTEND_PID=$!

cd "$SCRIPT_DIR"

echo ""
echo -e "${GREEN}TextAile is starting!${NC}"
echo ""
echo "  Frontend: http://spark.local:5174"
echo "  Backend:  http://spark.local:8001"
echo "  API Docs: http://spark.local:8001/docs"
echo ""
echo "Press Ctrl+C to stop all services"

# Handle shutdown
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down TextAile...${NC}"
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    echo -e "${GREEN}Stopped.${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Wait for processes
wait
