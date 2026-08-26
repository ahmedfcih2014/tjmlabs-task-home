from datetime import datetime

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from ninja import Schema

from apps.accounts.models import ApiKey
from apps.common.errors import AppError
from apps.common.hashing import canonical_json_bytes, sha256_hex
from apps.common.ids import prefixed_secret
from apps.webhooks.crypto import encrypt_secret
from apps.webhooks.delivery.retry import max_attempts
from apps.webhooks.models import Delivery, DeliveryStatus, Event, Subscription
from apps.webhooks.validation import normalize_event_type, normalize_event_types, validate_destination_url


class SubscriptionCreateIn(Schema):
    destination_url: str
    event_types: list[str]
    destination_secret: str | None = None


class SubscriptionOut(Schema):
    id: str
    destination_url: str
    event_types: list[str]
    signing_secret: str | None = None
    has_destination_secret: bool
    is_active: bool
    created_at: datetime


class EventIn(Schema):
    event_type: str
    payload: dict
    idempotency_key: str | None = None


class EventAcceptedOut(Schema):
    id: str
    event_type: str
    accepted_at: datetime
    matched_subscriptions: int
    delivery_ids: list[str]


class DeliverySummaryOut(Schema):
    id: str
    event_id: str
    event_type: str
    status: str
    attempt_count: int
    max_attempts: int
    next_attempt_at: datetime | None
    last_http_status: int | None
    last_error: str
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None


def create_subscription(api_key: ApiKey, data: SubscriptionCreateIn, signing_secret: str | None = None) -> tuple[Subscription, str]:
    destination_url = validate_destination_url(data.destination_url)
    event_types = normalize_event_types(data.event_types)
    signing_secret = signing_secret or prefixed_secret("whsec_")
    destination_secret_encrypted = None
    if data.destination_secret:
        destination_secret_encrypted = encrypt_secret(data.destination_secret)

    subscription = Subscription.objects.create(
        api_key=api_key,
        destination_url=destination_url,
        event_types=event_types,
        signing_secret_encrypted=encrypt_secret(signing_secret),
        destination_secret_encrypted=destination_secret_encrypted,
    )
    return subscription, signing_secret


def get_subscription(api_key: ApiKey, subscription_id: str) -> Subscription:
    try:
        return Subscription.objects.get(id=subscription_id, api_key=api_key)
    except Subscription.DoesNotExist as exc:
        raise AppError(404, "NOT_FOUND", "Subscription not found") from exc


def ingest_event(api_key: ApiKey, data: EventIn) -> tuple[Event, list[str], bool]:
    event_type = normalize_event_type(data.event_type)
    if not isinstance(data.payload, dict):
        raise AppError(400, "VALIDATION_ERROR", "payload must be a JSON object")

    payload_bytes = canonical_json_bytes(data.payload)
    if len(payload_bytes) > settings.WEBHOOK_MAX_PAYLOAD_BYTES:
        raise AppError(413, "PAYLOAD_TOO_LARGE", "Payload exceeds maximum size")

    payload_hash = sha256_hex(payload_bytes)

    if data.idempotency_key:
        existing = Event.objects.filter(api_key=api_key, idempotency_key=data.idempotency_key).first()
        if existing:
            if existing.payload_hash != payload_hash or existing.event_type != event_type:
                raise AppError(409, "IDEMPOTENCY_CONFLICT", "Idempotency key reused with different payload")
            delivery_ids = list(existing.deliveries.values_list("id", flat=True))
            return existing, delivery_ids, True

    with transaction.atomic():
        event = Event.objects.create(
            api_key=api_key,
            event_type=event_type,
            payload=data.payload,
            payload_hash=payload_hash,
            idempotency_key=data.idempotency_key,
        )
        subscriptions = Subscription.objects.filter(api_key=api_key, is_active=True)
        matching = [sub for sub in subscriptions if event_type in sub.event_types]
        delivery_ids: list[str] = []
        now = timezone.now()
        for subscription in matching:
            delivery = Delivery.objects.create(
                api_key=api_key,
                subscription=subscription,
                event=event,
                event_type=event_type,
                status=DeliveryStatus.PENDING,
                max_attempts=max_attempts(),
                next_attempt_at=now,
            )
            delivery_ids.append(delivery.id)

    return event, delivery_ids, False


def list_deliveries(api_key: ApiKey, subscription_id: str) -> list[Delivery]:
    subscription = get_subscription(api_key, subscription_id)
    return list(subscription.deliveries.select_related("event").order_by("-created_at"))


def delivery_to_schema(delivery: Delivery) -> DeliverySummaryOut:
    return DeliverySummaryOut(
        id=delivery.id,
        event_id=delivery.event_id,
        event_type=delivery.event_type,
        status=delivery.status,
        attempt_count=delivery.attempt_count,
        max_attempts=delivery.max_attempts,
        next_attempt_at=delivery.next_attempt_at,
        last_http_status=delivery.last_http_status,
        last_error=delivery.last_error,
        created_at=delivery.created_at,
        updated_at=delivery.updated_at,
        completed_at=delivery.completed_at,
    )
