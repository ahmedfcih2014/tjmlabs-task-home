from django.http import HttpRequest
from django.utils import timezone
from ninja.security import HttpBearer

from apps.accounts.models import ApiKey


class BearerAuth(HttpBearer):
    def authenticate(self, request: HttpRequest, token: str) -> ApiKey | None:
        api_key = ApiKey.authenticate(token)
        if api_key is None:
            return None
        ApiKey.objects.filter(pk=api_key.pk).update(last_used_at=timezone.now())
        request.api_key = api_key
        return api_key


auth = BearerAuth()
