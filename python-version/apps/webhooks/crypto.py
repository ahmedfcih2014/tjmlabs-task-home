from pathlib import Path

from django.conf import settings
from cryptography.fernet import Fernet, InvalidToken

from apps.common.errors import AppError


def _read_dev_fernet_key() -> str | None:
    dev_path = Path(settings.DEV_FERNET_KEY_PATH)
    if not dev_path.exists():
        return None
    key = dev_path.read_text(encoding="utf-8").strip()
    if not key:
        return None
    try:
        Fernet(key.encode("utf-8"))
    except Exception:
        return None
    return key


def _active_fernet_key() -> str:
    if settings.DEBUG:
        dev_key = _read_dev_fernet_key()
        if dev_key:
            return dev_key
    key = settings.WEBHOOK_RELAY_FERNET_KEY
    if not key:
        raise AppError(
            500,
            "CONFIG_ERROR",
            "WEBHOOK_RELAY_FERNET_KEY is not configured",
        )
    return key


def get_fernet() -> Fernet:
    key = _active_fernet_key()
    try:
        return Fernet(key.encode("utf-8") if isinstance(key, str) else key)
    except Exception as exc:
        raise AppError(500, "CONFIG_ERROR", "Invalid WEBHOOK_RELAY_FERNET_KEY") from exc


def encrypt_secret(plaintext: str) -> str:
    return get_fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_secret(ciphertext: str) -> str:
    try:
        return get_fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise AppError(
            500,
            "DECRYPT_ERROR",
            "Failed to decrypt stored secret. Run `python manage.py reset_webhook_data --yes` and recreate subscriptions.",
        ) from exc
