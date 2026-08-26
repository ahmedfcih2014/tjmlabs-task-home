import hashlib
import hmac
import secrets

from django.db import models

from apps.common.ids import prefixed_id


def default_api_key_id() -> str:
    return prefixed_id("key_")


def default_subscription_id() -> str:
    return prefixed_id("sub_")


def default_event_id() -> str:
    return prefixed_id("evt_")


def default_delivery_id() -> str:
    return prefixed_id("dlv_")


class ApiKey(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=default_api_key_id)
    name = models.CharField(max_length=128, blank=True, default="default")
    key_prefix = models.CharField(max_length=16, db_index=True)
    key_hash = models.CharField(max_length=64, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    @staticmethod
    def hash_key(raw_key: str) -> str:
        return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()

    @classmethod
    def generate(cls, name: str = "default") -> tuple["ApiKey", str]:
        raw_key = f"whr_{secrets.token_urlsafe(32)}"
        prefix = raw_key[:12]
        instance = cls.objects.create(
            name=name,
            key_prefix=prefix,
            key_hash=cls.hash_key(raw_key),
        )
        return instance, raw_key

    @classmethod
    def authenticate(cls, raw_key: str) -> "ApiKey | None":
        if not raw_key:
            return None
        key_hash = cls.hash_key(raw_key)
        try:
            api_key = cls.objects.get(key_hash=key_hash, is_active=True)
        except cls.DoesNotExist:
            return None
        if not hmac.compare_digest(api_key.key_hash, key_hash):
            return None
        return api_key
