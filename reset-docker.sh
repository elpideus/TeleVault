#!/bin/bash

# ANSI color codes
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo -e "${CYAN}🏺 TeleVault: Starting complete Docker reset...${NC}"

# Stop and remove all containers, networks, and volumes
echo -e "${YELLOW}🛑 Stopping and removing containers/volumes/networks...${NC}"
docker compose down -v --remove-orphans

# Rebuild and start the stack
echo -e "${GREEN}🏗️ Rebuilding and starting the TeleVault stack...${NC}"
docker compose up -d --build

echo -e "${GREEN}✅ TeleVault reset complete!${NC}"
echo -e "${CYAN}🌐 You can access the UI at: http://localhost:5173${NC}"
