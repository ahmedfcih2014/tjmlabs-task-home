import hmac
import hashlib
import time


def compute_signature(signing_secret: str, timestamp: str, body_bytes: bytes) -> str:
    canonical = f"{timestamp}.".encode("utf-8") + body_bytes
    digest = hmac.new(signing_secret.encode("utf-8"), canonical, hashlib.sha256).hexdigest()
    return f"v1={digest}"


def verify_signature(signing_secret: str, timestamp: str, body_bytes: bytes, signature: str, skew_seconds: int = 300) -> bool:
    try:
        ts = int(timestamp)
    except ValueError:
        return False
    if abs(int(time.time()) - ts) > skew_seconds:
        return False
    expected = compute_signature(signing_secret, timestamp, body_bytes)
    return hmac.compare_digest(expected, signature)
