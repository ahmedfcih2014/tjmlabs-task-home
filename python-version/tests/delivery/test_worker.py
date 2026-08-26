from unittest.mock import patch

import pytest
from django.utils import timezone

from apps.accounts.models import ApiKey
from apps.webhooks.delivery.http_client import HttpDeliveryResult
from apps.webhooks.delivery.worker import DeliveryWorker
from apps.webhooks.models import Delivery, DeliveryStatus
from apps.webhooks.services import SubscriptionCreateIn, create_subscription, ingest_event, EventIn


@pytest.mark.django_db
def test_worker_success_marks_delivery_succeeded():
    api_key, _ = ApiKey.generate()
    subscription, _ = create_subscription(
        api_key,
        SubscriptionCreateIn(destination_url="http://127.0.0.1/hook", event_types=["order.created"]),
    )
    event, delivery_ids, _ = ingest_event(
        api_key,
        EventIn(event_type="order.created", payload={"order_id": "1"}),
    )
    delivery = Delivery.objects.get(id=delivery_ids[0])

    with patch(
        "apps.webhooks.delivery.worker.post_json",
        return_value=HttpDeliveryResult(http_status=200, error="", duration_ms=10),
    ):
        assert DeliveryWorker().process_delivery(delivery.id) is True

    delivery.refresh_from_db()
    assert delivery.status == DeliveryStatus.SUCCEEDED
    assert delivery.attempt_count == 1


@pytest.mark.django_db
def test_worker_retries_on_503():
    api_key, _ = ApiKey.generate()
    create_subscription(
        api_key,
        SubscriptionCreateIn(destination_url="http://127.0.0.1/hook", event_types=["order.created"]),
    )
    _, delivery_ids, _ = ingest_event(
        api_key,
        EventIn(event_type="order.created", payload={"order_id": "1"}),
    )
    delivery = Delivery.objects.get(id=delivery_ids[0])

    with patch(
        "apps.webhooks.delivery.worker.post_json",
        return_value=HttpDeliveryResult(http_status=503, error="HTTP 503", duration_ms=10),
    ):
        DeliveryWorker().process_delivery(delivery.id)

    delivery.refresh_from_db()
    assert delivery.status == DeliveryStatus.FAILED
    assert delivery.attempt_count == 1
    assert delivery.next_attempt_at > timezone.now()


@pytest.mark.django_db
def test_worker_marks_400_as_dead():
    api_key, _ = ApiKey.generate()
    create_subscription(
        api_key,
        SubscriptionCreateIn(destination_url="http://127.0.0.1/hook", event_types=["order.created"]),
    )
    _, delivery_ids, _ = ingest_event(
        api_key,
        EventIn(event_type="order.created", payload={"order_id": "1"}),
    )
    delivery = Delivery.objects.get(id=delivery_ids[0])

    with patch(
        "apps.webhooks.delivery.worker.post_json",
        return_value=HttpDeliveryResult(http_status=400, error="HTTP 400", duration_ms=10),
    ):
        DeliveryWorker().process_delivery(delivery.id)

    delivery.refresh_from_db()
    assert delivery.status == DeliveryStatus.DEAD
    assert delivery.attempt_count == 1
