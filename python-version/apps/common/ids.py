import uuid


def prefixed_id(prefix: str) -> str:
    return f"{prefix}{uuid.uuid4().hex}"


def prefixed_secret(prefix: str) -> str:
    return f"{prefix}{uuid.uuid4().hex}{uuid.uuid4().hex[:8]}"
