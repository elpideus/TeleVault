from cryptography.fernet import Fernet, InvalidToken


def encrypt_string(plaintext: str, key: str) -> str:
    try:
        f = Fernet(key.encode())
    except Exception as exc:
        raise ValueError(f"Invalid Fernet key: {exc}") from exc
    return f.encrypt(plaintext.encode()).decode()


def decrypt_string(token: str, key: str) -> str:
    try:
        f = Fernet(key.encode())
    except Exception as exc:
        raise ValueError(f"Invalid Fernet key: {exc}") from exc
    try:
        return f.decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Invalid or corrupted token") from exc
