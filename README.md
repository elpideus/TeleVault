# 🏺 TeleVault

<div align="center">
  <p>🚀 <b>Turn Your Telegram into a Powerful, Self-Hosted Cloud Storage Vault</b> 🏺</p>
  <p>
    <a href="https://github.com/elpideus/TeleVault/releases"><img src="https://img.shields.io/github/v/release/elpideus/TeleVault?style=for-the-badge&color=6366f1" alt="Release"></a>
    <a href="LICENSE"><img src="https://img.shields.io/github/license/elpideus/TeleVault?style=for-the-badge&color=8b5cf6" alt="License"></a>
    <a href="https://github.com/elpideus/TeleVault/stargazers"><img src="https://img.shields.io/github/stars/elpideus/TeleVault?style=for-the-badge&color=ec4899" alt="GitHub Stars"></a>
    <a href="https://github.com/elpideus/TeleVault/network/members"><img src="https://img.shields.io/github/forks/elpideus/TeleVault?style=for-the-badge&color=f43f5e" alt="GitHub Forks"></a>
  </p>
  <p>
    <a href="https://revolut.me/elpideus"><img src="https://img.shields.io/badge/Support_the_Project-Revolut-0966FE?style=for-the-badge&logo=revolut&logoColor=white" alt="Support the Project"></a>
  </p>
</div>

---

**TeleVault** is a self-hosted, open-source cloud storage platform that uses Telegram as its storage backend. 📤 Upload, organize, and manage your files through a clean, modern web interface — all stored securely and privately in your own Telegram account. 🛡️

> [!WARNING]
> **TeleVault is currently under active development.** 🛠️ While we strive for stability, this software is in an alpha/beta state and could potentially contain bugs that might impact your data or files. **Always maintain independent backups of important data.** Use at your own risk. 🚨
>
> **Use Responsibly.** ⚠️ TeleVault is designed for personal file storage and organization. Telegram's infrastructure is a shared resource — please avoid mass-hoarding, automated bulk transfers, or any usage patterns that could violate [Telegram's Terms of Service](https://telegram.org/tos). Irresponsible use puts your account at risk of suspension and burdens Telegram's platform for everyone. Use this tool as you would any personal cloud storage service: for your own files, at a human scale. ⚖️

---

## ✨ Features

- **📁 Hierarchical Organization** — Create nested folders (up to 10 levels deep) with custom icons and accent colors
- **⚡ File Upload & Download** — Upload files of any size with real-time progress tracking via Server-Sent Events
- **🖼️ Multiple View Modes** — Switch between grid, list, and table views in the file explorer
- **🖱️ Drag & Drop** — Drag files and folders to reorganize your vault intuitively
- **✅ Multi-Select** — Lasso selection and bulk operations (move, copy, delete)
- **🔍 File Search** — Search across your entire vault by name and metadata
- **🔑 Secure Authentication** — Telegram OTP and QR-code login with JWT + refresh token sessions
- **🔒 Encrypted Sessions** — Telegram session strings are stored with Fernet encryption
- **📡 Real-Time Updates** — Live progress indicators for uploads and downloads
- **🧩 Deduplication** — Content-hash based file deduplication to avoid redundant storage
- **🏠 Self-Hosted** — Full control over your data and configuration

### 🔜 Coming Soon

- 🎨 Themes & accent color customization
- 📏 Density settings
- 🗺️ Per-folder Telegram channel routing
- ⚖️ Multiple Telegram accounts for parallel uploads/downloads
- ⌨️ Custom keybinds & full keyboard navigation
- 📥 Data import & export
- 📊 Custom storage and bandwidth limits
- 🖥️ Functional command panel
- 🔄 Sync client settings across devices
- 🖼️ File thumbnails and in-browser previews
- 🔗 File and folder sharing

---

## 🛠️ Tech Stack

| Layer | Technology |
| --- | --- |
| **🎨 Frontend** | React 19, TypeScript, Vite, Tailwind CSS 4 |
| **🧠 State Management** | Zustand, TanStack Query |
| **⚙️ Backend** | FastAPI, Python 3.12+, Uvicorn |
| **🗄️ Database** | PostgreSQL 16 (async via AsyncPG + SQLAlchemy 2) |
| **📱 Telegram** | Telethon (MTProto) |
| **🔐 Auth** | JWT, Fernet encryption |
| **🐳 Infrastructure** | Docker, Docker Compose, Nginx |

---

## 🚀 Getting Started

### 📋 Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/)
- A Telegram account 📱
- A Telegram **API ID** and **API Hash** — obtain these from [my.telegram.org/apps](https://my.telegram.org/apps) 🔑

### 📥 Installation

**1. Clone the repository** 📦

```bash
git clone https://github.com/elpideus/TeleVault.git
cd TeleVault
```

**2. Configure your environment** ⚙️

```bash
cp .env.example .env
```

Open `.env` and fill in the required values:

```env
# --- Required ---

# Your Telegram API credentials (from my.telegram.org/apps)
TELEGRAM_API_ID=your_api_id
TELEGRAM_API_HASH=your_api_hash

# PostgreSQL credentials
POSTGRES_USER=televault
POSTGRES_PASSWORD=a_strong_password_here
POSTGRES_DB=televault

# Security — generate with: openssl rand -hex 32
JWT_SECRET=your_jwt_secret

# Fernet encryption key — generate with:
# python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
ENCRYPTION_KEY=your_fernet_key

# Allowed CORS origins (your frontend URL)
CORS_ORIGINS=["http://localhost:5173"]

# --- Optional ---

# Automatically grant admin role to this Telegram user ID on first login
ADMIN_TELEGRAM_ID=

# Port to expose the frontend on (default: 5173)
FRONTEND_PORT=5173
```

**3. Start the stack 🏗️**

```bash
docker compose up -d
```

### 🆙 Updating TeleVault

To update your installation to the latest version, follow these steps:

**Using Docker Compose:**

1. Pull the latest images:
   ```bash
   docker compose pull
   ```

2. Restart the containers:
   ```bash
   docker compose up -d
   ```

3. (Optional) Remove old, unused images:
   ```bash
   docker image prune -f
   ```

**Using the All-in-One image:**

1. Stop and remove the existing container:
   ```bash
   docker stop televault
   docker rm televault
   ```

2. Pull the latest image:
   ```bash
   docker pull ghcr.io/elpideus/televault:latest
   ```

3. Run the new container with your previous environment variables and volumes.

---

#### Alternative: single all-in-one container

If you prefer not to use Docker Compose, TeleVault ships an all-in-one image that bundles PostgreSQL, the backend, and Nginx in a single container:

```bash
docker run -d \
  --name televault \
  -p 5173:80 \
  -e POSTGRES_USER=televault \
  -e POSTGRES_PASSWORD=your_strong_password \
  -e POSTGRES_DB=televault \
  -e TELEGRAM_API_ID=your_api_id \
  -e TELEGRAM_API_HASH=your_api_hash \
  -e JWT_SECRET=your_jwt_secret \
  -e ENCRYPTION_KEY=your_fernet_key \
  -e REFRESH_TOKEN_TTL_DAYS=90 \
  -e MAX_FOLDER_DEPTH=10 \
  -e MAX_ICON_SIZE_BYTES=512000 \
  -e ICONS_DIR=./static/database/folders/icons \
  -e 'CORS_ORIGINS=["http://localhost:5173"]' \
  -e DEBUG_UI=false \
  -e VITE_THEME=default \
  ghcr.io/elpideus/televault:latest
```

Replace `-p 5173:80` with your desired host port and update `CORS_ORIGINS` to match. PostgreSQL is initialised and migrated automatically on first run. To persist data across restarts, add `-v televault_data:/var/lib/postgresql/16/main`.

**4. Log in 🔑**

Use your Telegram phone number. You will receive a one-time code via Telegram to complete authentication. The first user to log in is automatically promoted to admin if `ADMIN_TELEGRAM_ID` is not set.

---

## 📋 Configuration Reference

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `TELEGRAM_API_ID` | Yes | — | Telegram API ID from my.telegram.org |
| `TELEGRAM_API_HASH` | Yes | — | Telegram API Hash from my.telegram.org |
| `ADMIN_TELEGRAM_ID` | No | — | Telegram user ID to auto-promote to admin |
| `POSTGRES_USER` | Yes | — | PostgreSQL username |
| `POSTGRES_PASSWORD` | Yes | — | PostgreSQL password |
| `POSTGRES_DB` | Yes | — | PostgreSQL database name |
| `DATABASE_URL` | No | Auto-built | Override the full database connection URL |
| `JWT_SECRET` | Yes | — | Secret key for signing JWT tokens |
| `ENCRYPTION_KEY` | Yes | — | Fernet key for encrypting Telegram sessions |
| `REFRESH_TOKEN_TTL_DAYS` | No | `90` | Lifetime of refresh tokens in days |
| `MAX_FOLDER_DEPTH` | No | `10` | Maximum folder nesting depth |
| `MAX_ICON_SIZE_BYTES` | No | `512000` | Maximum size for custom folder icons |
| `CORS_ORIGINS` | Yes | — | JSON array of allowed CORS origins |
| `FRONTEND_PORT` | No | `5173` | Host port for the frontend container |
| `VITE_API_BASE_URL` | No | *(empty)* | Frontend API base URL (leave empty in Docker) |
| `VITE_THEME` | No | `default` | UI theme to build the frontend with |
| `DEBUG_UI` | No | `false` | Enable debug UI elements |

---

## 📂 Project Structure

```
TeleVault/
├── backend/                # ⚙️ FastAPI application
├── frontend/               # 🎨 React + TypeScript SPA
└── docker-compose.yml      # 🐳 Service orchestration
```

---

## 💖 Support the Project

TeleVault is a labor of love, built to provide a free way to manage your files. If you find value in this project and would like to support its ongoing development, consider buying me a coffee! ☕

[![Support on Revolut](https://img.shields.io/badge/Support_on_Revolut-0966FE?style=for-the-badge&logo=revolut&logoColor=white)](https://revolut.me/elpideus)

Every donation helps keep the project alive and motivated. Thank you for your support! 🙏

---

## 🤝 Contributing

Contributions are welcome! ✨ Please open an issue to discuss significant changes before submitting a pull request.

1. Fork the repository 🍴
2. Create a feature branch (`git checkout -b feature/my-feature`) 🌿
3. Commit your changes 💾
4. Push and open a pull request against `main` 🚀

---

## 📝 Changelog

See [CHANGELOG.md](CHANGELOG.md) for a full history of notable changes. 📖

---

## ⚖️ License

TeleVault is licensed under the [GNU General Public License v3.0](LICENSE). 📜

You are free to use, modify, and distribute this software under the terms of the GPLv3. Any derivative work must also be distributed under the same license.

---

## ⚠️ Disclaimer

TeleVault is an independent, community-built project and is not affiliated with, endorsed by, or in any way officially connected to Telegram Messenger or Telegram FZ-LLC. Use of this software is at your own risk and responsibility. ⚖️
