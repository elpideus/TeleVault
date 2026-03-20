import secrets

import base58


def generate_vault_hash() -> str:
    """Generate a random, URL-safe vault hash (~22 base58 chars)."""
    return base58.b58encode(secrets.token_bytes(16)).decode("ascii")
