import os
from pathlib import Path

from cryptography.fernet import Fernet

BASE_DIR = Path(__file__).resolve().parent.parent
DEV_FERNET_KEY_PATH = BASE_DIR / ".dev-fernet-key"


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _is_valid_fernet_key(key: str) -> bool:
    if not key:
        return False
    try:
        Fernet(key.encode("utf-8"))
        return True
    except Exception:
        return False


def _load_or_create_dev_fernet_key() -> str:
    if DEV_FERNET_KEY_PATH.exists():
        key = DEV_FERNET_KEY_PATH.read_text(encoding="utf-8").strip()
        if _is_valid_fernet_key(key):
            return key
    key = Fernet.generate_key().decode()
    DEV_FERNET_KEY_PATH.write_text(key, encoding="utf-8")
    return key


def _resolve_fernet_key(debug: bool, secret_key: str) -> str:
    env_key = os.environ.get("WEBHOOK_RELAY_FERNET_KEY", "").strip()
    if _is_valid_fernet_key(env_key):
        return env_key
    if debug:
        return _load_or_create_dev_fernet_key()
    return env_key


_load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-change-me-in-production")
DEBUG = os.environ.get("DEBUG", "true").lower() in {"1", "true", "yes"}
ALLOW_INSECURE_WEBHOOKS = os.environ.get("ALLOW_INSECURE_WEBHOOKS", "true" if DEBUG else "false").lower() in {
    "1",
    "true",
    "yes",
}

ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1,testserver").split(",")

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "apps.accounts",
    "apps.webhooks",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
        "OPTIONS": {
            "timeout": 30,
        },
    }
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
USE_TZ = True
TIME_ZONE = "UTC"

WEBHOOK_RELAY_FERNET_KEY = _resolve_fernet_key(DEBUG, SECRET_KEY)
WEBHOOK_MAX_ATTEMPTS = int(os.environ.get("WEBHOOK_MAX_ATTEMPTS", "4"))
WEBHOOK_HTTP_TIMEOUT_SECONDS = float(os.environ.get("WEBHOOK_HTTP_TIMEOUT_SECONDS", "5"))
WEBHOOK_LEASE_SECONDS = int(os.environ.get("WEBHOOK_LEASE_SECONDS", "120"))
WEBHOOK_MAX_PAYLOAD_BYTES = int(os.environ.get("WEBHOOK_MAX_PAYLOAD_BYTES", str(64 * 1024)))

LANGUAGE_CODE = "en-us"
