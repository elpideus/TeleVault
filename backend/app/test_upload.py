import asyncio
import os
import sys

# Ensure parent is in path if needed for "app." imports, but inside docker, /app is actually the source of "app". Wait, usually Dockerfile copies ./app to /app.
from core.security import create_access_token
import httpx

async def main():
    telegram_id = 1087016383
    token = create_access_token({"sub": str(telegram_id)})
    url = "http://localhost:8000/api/v1/files/upload"
    
    with open("test.txt", "wb") as f:
        f.write(b"Hello world!")
        
    files = [
        ('file', ('test.txt', open('test.txt', 'rb'), 'text/plain')),
        ('filename', (None, b'test.txt')),
        ('file_hash', (None, b'myhash')),
    ]
    
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient() as client:
        res = await client.post(url, files=files, headers=headers)
        print("Status Code:", res.status_code)
        print("Response:", res.text)

if __name__ == "__main__":
    asyncio.run(main())
