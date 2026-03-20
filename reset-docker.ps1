Write-Host "🏺 TeleVault: Starting complete Docker reset..." -ForegroundColor Cyan

# Stop and remove all containers, networks, and volumes
Write-Host "🛑 Stopping and removing containers/volumes/networks..." -ForegroundColor Yellow
docker compose down -v --remove-orphans

# Rebuild and start the stack
Write-Host "🏗️ Rebuilding and starting the TeleVault stack..." -ForegroundColor Green
docker compose up -d --build

Write-Host "✅ TeleVault reset complete!" -ForegroundColor Green
Write-Host "🌐 You can access the UI at: http://localhost:5173" -ForegroundColor Cyan
