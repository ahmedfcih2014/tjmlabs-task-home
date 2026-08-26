from django.core.management.base import BaseCommand

from apps.accounts.models import ApiKey


class Command(BaseCommand):
    help = "Create a new API key for webhook relay callers."

    def add_arguments(self, parser) -> None:
        parser.add_argument("--name", default="default", help="Label for the API key")

    def handle(self, *args, **options) -> None:
        api_key, raw_key = ApiKey.generate(name=options["name"])
        self.stdout.write(self.style.SUCCESS(f"Created API key {api_key.id} ({api_key.name})"))
        self.stdout.write("")
        self.stdout.write("Save this key now; it will not be shown again:")
        self.stdout.write(raw_key)
