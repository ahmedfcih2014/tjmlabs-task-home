from datetime import timedelta

from django.conf import settings
from django.utils import timezone

RETRY_DELAYS_SECONDS = [1, 5, 25]


def is_retryable_http_status(status_code: int | None) -> bool:
    if status_code is None:
        return True
    if status_code in {408, 429}:
        return True
    if 500 <= status_code <= 599:
        return True
    return False


def should_retry(attempt_count: int, max_attempts: int, status_code: int | None) -> bool:
    if attempt_count >= max_attempts:
        return False
    return is_retryable_http_status(status_code)


def next_attempt_at(attempt_count: int) -> timezone.datetime:
    delay_index = min(max(attempt_count - 1, 0), len(RETRY_DELAYS_SECONDS) - 1)
    delay = RETRY_DELAYS_SECONDS[delay_index]
    return timezone.now() + timedelta(seconds=delay)


def max_attempts() -> int:
    return settings.WEBHOOK_MAX_ATTEMPTS
