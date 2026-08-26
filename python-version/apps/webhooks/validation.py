import re

from django.conf import settings
from urllib.parse import urlparse

from apps.common.errors import AppError

EVENT_TYPE_PATTERN = re.compile(r"^[a-z][a-z0-9_.-]{0,63}$")


def normalize_event_type(event_type: str) -> str:
    normalized = event_type.strip().lower()
    if not EVENT_TYPE_PATTERN.match(normalized):
        raise AppError(
            400,
            "VALIDATION_ERROR",
            "Invalid event_type format",
            {"event_type": event_type},
        )
    return normalized


def normalize_event_types(event_types: list[str]) -> list[str]:
    if not event_types:
        raise AppError(400, "VALIDATION_ERROR", "event_types must not be empty")
    if len(event_types) > 20:
        raise AppError(400, "VALIDATION_ERROR", "event_types must contain at most 20 items")
    normalized = [normalize_event_type(value) for value in event_types]
    if len(set(normalized)) != len(normalized):
        raise AppError(400, "VALIDATION_ERROR", "event_types must be unique")
    return normalized


def validate_destination_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in {"https", "http"}:
        raise AppError(400, "VALIDATION_ERROR", "destination_url must use http or https")
    if not parsed.netloc:
        raise AppError(400, "VALIDATION_ERROR", "destination_url must be absolute")
    if parsed.username or parsed.password:
        raise AppError(400, "VALIDATION_ERROR", "destination_url must not include credentials")

    if parsed.scheme == "http":
        if not settings.ALLOW_INSECURE_WEBHOOKS:
            raise AppError(422, "UNSAFE_DESTINATION", "Only https destinations are allowed")
        host = parsed.hostname or ""
        if host not in {"localhost", "127.0.0.1"}:
            raise AppError(
                422,
                "UNSAFE_DESTINATION",
                "http destinations are only allowed for localhost in insecure mode",
            )
    return url
