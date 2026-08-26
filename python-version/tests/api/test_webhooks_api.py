import json

import pytest
from django.test import Client

from apps.accounts.models import ApiKey


@pytest.fixture
def api_client():
    return Client()


@pytest.fixture
def auth_headers():
    _, raw_key = ApiKey.generate(name="test")
    return {"HTTP_AUTHORIZATION": f"Bearer {raw_key}"}


@pytest.mark.django_db
def test_unauthorized_requests(api_client):
    response = api_client.post(
        "/api/v1/subscriptions",
        data=json.dumps({"destination_url": "http://127.0.0.1/hook", "event_types": ["order.created"]}),
        content_type="application/json",
    )
    assert response.status_code == 401


@pytest.mark.django_db
def test_create_subscription_returns_signing_secret_once(api_client, auth_headers):
    response = api_client.post(
        "/api/v1/subscriptions",
        data=json.dumps(
            {
                "destination_url": "http://127.0.0.1/hook",
                "event_types": ["order.created"],
                "destination_secret": "dest-secret",
            }
        ),
        content_type="application/json",
        **auth_headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["signing_secret"].startswith("whsec_")
    assert body["has_destination_secret"] is True

    get_response = api_client.get(f"/api/v1/subscriptions/{body['id']}", **auth_headers)
    assert get_response.status_code == 200
    assert get_response.json()["signing_secret"] is None


@pytest.mark.django_db
def test_event_fanout_and_idempotency(api_client, auth_headers):
    create_response = api_client.post(
        "/api/v1/subscriptions",
        data=json.dumps({"destination_url": "http://127.0.0.1/a", "event_types": ["order.created"]}),
        content_type="application/json",
        **auth_headers,
    )
    sub_a = create_response.json()["id"]

    api_client.post(
        "/api/v1/subscriptions",
        data=json.dumps({"destination_url": "http://127.0.0.1/b", "event_types": ["user.created"]}),
        content_type="application/json",
        **auth_headers,
    )

    event_payload = {
        "event_type": "order.created",
        "payload": {"order_id": "123"},
        "idempotency_key": "evt-1",
    }
    first = api_client.post(
        "/api/v1/events",
        data=json.dumps(event_payload),
        content_type="application/json",
        **auth_headers,
    )
    assert first.status_code == 202
    first_body = first.json()
    assert first_body["matched_subscriptions"] == 1

    second = api_client.post(
        "/api/v1/events",
        data=json.dumps(event_payload),
        content_type="application/json",
        **auth_headers,
    )
    assert second.status_code == 200
    assert second.json()["id"] == first_body["id"]

    deliveries = api_client.get(f"/api/v1/subscriptions/{sub_a}/deliveries", **auth_headers)
    assert deliveries.status_code == 200
    assert len(deliveries.json()) == 1
