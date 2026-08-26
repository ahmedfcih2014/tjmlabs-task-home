from django.http import HttpRequest
from ninja import Router
from ninja.responses import Response

from apps.accounts.auth import auth
from apps.accounts.models import ApiKey
from apps.webhooks.services import (
    EventAcceptedOut,
    EventIn,
    SubscriptionCreateIn,
    SubscriptionOut,
    create_subscription,
    delivery_to_schema,
    get_subscription,
    ingest_event,
    list_deliveries,
)

router = Router()


@router.post("/subscriptions", response={201: SubscriptionOut}, auth=auth)
def create_subscription_endpoint(request: HttpRequest, payload: SubscriptionCreateIn):
    api_key: ApiKey = request.api_key
    subscription, signing_secret = create_subscription(api_key, payload)
    return Response(
        SubscriptionOut(
            id=subscription.id,
            destination_url=subscription.destination_url,
            event_types=subscription.event_types,
            signing_secret=signing_secret,
            has_destination_secret=bool(subscription.destination_secret_encrypted),
            is_active=subscription.is_active,
            created_at=subscription.created_at,
        ),
        status=201,
    )


@router.get("/subscriptions/{subscription_id}", response=SubscriptionOut, auth=auth)
def get_subscription_endpoint(request: HttpRequest, subscription_id: str):
    api_key: ApiKey = request.api_key
    subscription = get_subscription(api_key, subscription_id)
    return SubscriptionOut(
        id=subscription.id,
        destination_url=subscription.destination_url,
        event_types=subscription.event_types,
        signing_secret=None,
        has_destination_secret=bool(subscription.destination_secret_encrypted),
        is_active=subscription.is_active,
        created_at=subscription.created_at,
    )


@router.post("/events", response={200: EventAcceptedOut, 202: EventAcceptedOut}, auth=auth)
def ingest_event_endpoint(request: HttpRequest, payload: EventIn):
    api_key: ApiKey = request.api_key
    event, delivery_ids, replay = ingest_event(api_key, payload)
    body = EventAcceptedOut(
        id=event.id,
        event_type=event.event_type,
        accepted_at=event.created_at,
        matched_subscriptions=len(delivery_ids),
        delivery_ids=delivery_ids,
    )
    return Response(body, status=200 if replay else 202)


@router.get("/subscriptions/{subscription_id}/deliveries", response=list, auth=auth)
def list_deliveries_endpoint(request: HttpRequest, subscription_id: str):
    api_key: ApiKey = request.api_key
    deliveries = list_deliveries(api_key, subscription_id)
    return [delivery_to_schema(delivery) for delivery in deliveries]
