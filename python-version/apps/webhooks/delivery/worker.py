import logging
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.common.errors import AppError
from apps.webhooks.crypto import decrypt_secret
from apps.webhooks.delivery.http_client import HttpDeliveryResult, build_event_body, post_json
from apps.webhooks.delivery.retry import is_retryable_http_status, next_attempt_at, should_retry
from apps.webhooks.delivery.signing import compute_signature
from apps.webhooks.models import Delivery, DeliveryAttemptLog, DeliveryStatus
from apps.webhooks.validation import validate_destination_url

logger = logging.getLogger(__name__)


class DeliveryWorker:
    def __init__(self, batch_size: int = 10) -> None:
        self.batch_size = batch_size

    def run_once(self) -> int:
        processed = 0
        self.reclaim_stale_leases()
        due_ids = list(
            Delivery.objects.filter(
                status__in=[DeliveryStatus.PENDING, DeliveryStatus.FAILED],
                next_attempt_at__lte=timezone.now(),
            )
            .order_by("next_attempt_at")
            .values_list("id", flat=True)[: self.batch_size]
        )
        for delivery_id in due_ids:
            if self.process_delivery(delivery_id):
                processed += 1
        return processed

    def reclaim_stale_leases(self) -> None:
        cutoff = timezone.now() - timedelta(seconds=settings.WEBHOOK_LEASE_SECONDS)
        Delivery.objects.filter(
            status=DeliveryStatus.IN_PROGRESS,
            locked_at__lt=cutoff,
        ).update(
            status=DeliveryStatus.FAILED,
            lock_token=None,
            locked_at=None,
            next_attempt_at=timezone.now(),
            updated_at=timezone.now(),
        )

    def process_delivery(self, delivery_id: str) -> bool:
        lock_token = uuid.uuid4().hex
        now = timezone.now()
        updated = Delivery.objects.filter(
            id=delivery_id,
            status__in=[DeliveryStatus.PENDING, DeliveryStatus.FAILED],
            next_attempt_at__lte=now,
        ).update(
            status=DeliveryStatus.IN_PROGRESS,
            lock_token=lock_token,
            locked_at=now,
            updated_at=now,
        )
        if updated != 1:
            return False

        delivery = Delivery.objects.select_related("subscription", "event").get(id=delivery_id)
        return self._attempt_delivery(delivery, lock_token)

    def _attempt_delivery(self, delivery: Delivery, lock_token: str) -> bool:
        if delivery.lock_token != lock_token:
            return False

        subscription = delivery.subscription
        event = delivery.event
        started_at = timezone.now()
        attempt_number = delivery.attempt_count + 1

        terminal_error = False
        try:
            validate_destination_url(subscription.destination_url)
            signing_secret = decrypt_secret(subscription.signing_secret_encrypted)
            body_bytes = build_event_body(event.id, event.event_type, event.payload)
            timestamp = str(int(timezone.now().timestamp()))
            signature = compute_signature(signing_secret, timestamp, body_bytes)

            headers = {
                "Content-Type": "application/json",
                "User-Agent": "WebhookRelay/1.0",
                "X-Webhook-Id": delivery.id,
                "X-Webhook-Timestamp": timestamp,
                "X-Webhook-Signature": signature,
                "X-Webhook-Event-Type": event.event_type,
                "X-Webhook-Event-Id": event.id,
            }
            if subscription.destination_secret_encrypted:
                destination_secret = decrypt_secret(subscription.destination_secret_encrypted)
                headers["Authorization"] = f"Bearer {destination_secret}"

            result = post_json(
                subscription.destination_url,
                body_bytes,
                headers,
                timeout_seconds=settings.WEBHOOK_HTTP_TIMEOUT_SECONDS,
            )
        except AppError as exc:
            terminal_error = exc.code in {"DECRYPT_ERROR", "CONFIG_ERROR", "UNSAFE_DESTINATION"}
            result = HttpDeliveryResult(http_status=None, error=str(exc.message), duration_ms=0)
        except Exception as exc:
            result = HttpDeliveryResult(http_status=None, error=str(exc), duration_ms=0)

        finished_at = timezone.now()
        with transaction.atomic():
            delivery = Delivery.objects.select_for_update().get(id=delivery.id)
            if delivery.lock_token != lock_token:
                return False

            DeliveryAttemptLog.objects.create(
                delivery=delivery,
                attempt_number=attempt_number,
                started_at=started_at,
                finished_at=finished_at,
                http_status=result.http_status,
                error=result.error,
                duration_ms=result.duration_ms,
            )

            delivery.attempt_count = attempt_number
            delivery.last_http_status = result.http_status
            delivery.last_error = result.error
            delivery.lock_token = None
            delivery.locked_at = None
            delivery.updated_at = finished_at

            if result.http_status is not None and 200 <= result.http_status <= 299:
                delivery.status = DeliveryStatus.SUCCEEDED
                delivery.completed_at = finished_at
                delivery.next_attempt_at = finished_at
            elif terminal_error or not should_retry(delivery.attempt_count, delivery.max_attempts, result.http_status):
                delivery.status = DeliveryStatus.DEAD
                delivery.completed_at = finished_at
                delivery.next_attempt_at = finished_at
            else:
                delivery.status = DeliveryStatus.FAILED
                delivery.next_attempt_at = next_attempt_at(delivery.attempt_count)

            delivery.save()

        logger.info(
            "delivery_attempt",
            extra={
                "delivery_id": delivery.id,
                "event_id": event.id,
                "subscription_id": subscription.id,
                "attempt_number": attempt_number,
                "http_status": result.http_status,
                "status": delivery.status,
            },
        )
        return True
