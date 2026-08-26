from django.db import models

from apps.accounts.models import ApiKey
from apps.common.ids import prefixed_id


def default_subscription_id() -> str:
    return prefixed_id("sub_")


def default_event_id() -> str:
    return prefixed_id("evt_")


def default_delivery_id() -> str:
    return prefixed_id("dlv_")


class Subscription(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=default_subscription_id)
    api_key = models.ForeignKey(ApiKey, on_delete=models.CASCADE, related_name="subscriptions")
    destination_url = models.TextField()
    event_types = models.JSONField(default=list)
    signing_secret_encrypted = models.TextField()
    destination_secret_encrypted = models.TextField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["api_key", "created_at"]),
            models.Index(fields=["api_key", "is_active"]),
        ]


class Event(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=default_event_id)
    api_key = models.ForeignKey(ApiKey, on_delete=models.CASCADE, related_name="events")
    event_type = models.CharField(max_length=64, db_index=True)
    payload = models.JSONField()
    payload_hash = models.CharField(max_length=64)
    idempotency_key = models.CharField(max_length=128, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["api_key", "idempotency_key"],
                condition=models.Q(idempotency_key__isnull=False),
                name="unique_event_idempotency_per_api_key",
            )
        ]
        indexes = [
            models.Index(fields=["api_key", "created_at"]),
        ]


class DeliveryStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    IN_PROGRESS = "in_progress", "In Progress"
    FAILED = "failed", "Failed"
    SUCCEEDED = "succeeded", "Succeeded"
    DEAD = "dead", "Dead"


class Delivery(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=default_delivery_id)
    api_key = models.ForeignKey(ApiKey, on_delete=models.CASCADE, related_name="deliveries")
    subscription = models.ForeignKey(Subscription, on_delete=models.CASCADE, related_name="deliveries")
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="deliveries")
    event_type = models.CharField(max_length=64)
    status = models.CharField(max_length=32, choices=DeliveryStatus.choices, default=DeliveryStatus.PENDING)
    attempt_count = models.PositiveSmallIntegerField(default=0)
    max_attempts = models.PositiveSmallIntegerField(default=4)
    next_attempt_at = models.DateTimeField()
    locked_at = models.DateTimeField(null=True, blank=True)
    lock_token = models.CharField(max_length=64, null=True, blank=True)
    last_http_status = models.PositiveSmallIntegerField(null=True, blank=True)
    last_error = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["subscription", "event"], name="unique_delivery_per_subscription_event")
        ]
        indexes = [
            models.Index(fields=["status", "next_attempt_at"]),
            models.Index(fields=["subscription", "created_at"]),
            models.Index(fields=["event"]),
        ]


class DeliveryAttemptLog(models.Model):
    id = models.BigAutoField(primary_key=True)
    delivery = models.ForeignKey(Delivery, on_delete=models.CASCADE, related_name="attempts")
    attempt_number = models.PositiveSmallIntegerField()
    started_at = models.DateTimeField()
    finished_at = models.DateTimeField()
    http_status = models.PositiveSmallIntegerField(null=True, blank=True)
    error = models.TextField(blank=True, default="")
    duration_ms = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["delivery", "attempt_number"], name="unique_attempt_number_per_delivery")
        ]
