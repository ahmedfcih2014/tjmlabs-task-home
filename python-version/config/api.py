from ninja import NinjaAPI

from apps.common.errors import AppError, error_response
from apps.webhooks.api import router as webhooks_router

api = NinjaAPI(title="Webhook Relay", version="1.0.0")
api.add_router("/v1", webhooks_router)


@api.exception_handler(AppError)
def handle_app_error(request, exc: AppError):
    return api.create_response(request, error_response(exc), status=exc.status_code)
