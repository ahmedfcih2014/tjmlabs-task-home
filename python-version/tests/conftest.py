import pytest
from cryptography.fernet import Fernet
from django.conf import settings


@pytest.fixture(autouse=True)
def configure_test_settings():
    settings.WEBHOOK_RELAY_FERNET_KEY = Fernet.generate_key().decode()
    settings.ALLOW_INSECURE_WEBHOOKS = True
    settings.DEBUG = True
