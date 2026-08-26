import pytest

from apps.accounts.models import ApiKey
from apps.webhooks.crypto import decrypt_secret, encrypt_secret
from apps.webhooks.delivery.retry import is_retryable_http_status, should_retry
from apps.webhooks.delivery.signing import compute_signature, verify_signature


@pytest.mark.django_db
def test_api_key_generate_and_authenticate():
    api_key, raw = ApiKey.generate(name="test")
    assert raw.startswith("whr_")
    assert ApiKey.authenticate(raw) == api_key
    assert ApiKey.authenticate("invalid") is None


def test_fernet_round_trip():
    ciphertext = encrypt_secret("top-secret")
    assert decrypt_secret(ciphertext) == "top-secret"


def test_hmac_signature_and_verification():
    body = b'{"id":"evt_1","type":"order.created","payload":{"x":1}}'
    timestamp = "1700000000"
    secret = "whsec_test"
    signature = compute_signature(secret, timestamp, body)
    assert verify_signature(secret, timestamp, body, signature, skew_seconds=999999999)


def test_hmac_rejects_tampered_body():
    body = b'{"id":"evt_1"}'
    timestamp = "1700000000"
    secret = "whsec_test"
    signature = compute_signature(secret, timestamp, body)
    assert not verify_signature(secret, timestamp, b'{"id":"evt_2"}', signature, skew_seconds=999999999)


@pytest.mark.parametrize(
    ("status", "expected"),
    [
        (503, True),
        (429, True),
        (408, True),
        (400, False),
        (404, False),
        (None, True),
    ],
)
def test_retryable_statuses(status, expected):
    assert is_retryable_http_status(status) is expected


def test_should_retry_respects_max_attempts():
    assert should_retry(3, 4, 503) is True
    assert should_retry(4, 4, 503) is False
