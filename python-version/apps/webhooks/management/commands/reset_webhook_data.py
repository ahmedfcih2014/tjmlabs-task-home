from django.core.management.base import BaseCommand

from apps.webhooks.models import Delivery, DeliveryAttemptLog, Event, Subscription


class Command(BaseCommand):
    help = "Delete all subscriptions, events, and deliveries (use after Fernet key changes)."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--yes",
            action="store_true",
            help="Skip confirmation prompt",
        )

    def handle(self, *args, **options) -> None:
        counts = {
            "attempts": DeliveryAttemptLog.objects.count(),
            "deliveries": Delivery.objects.count(),
            "events": Event.objects.count(),
            "subscriptions": Subscription.objects.count(),
        }
        if not any(counts.values()):
            self.stdout.write(self.style.WARNING("Nothing to reset."))
            return

        if not options["yes"]:
            self.stdout.write(
                f"Will delete {counts['subscriptions']} subscriptions, "
                f"{counts['events']} events, {counts['deliveries']} deliveries, "
                f"{counts['attempts']} attempt logs."
            )
            confirm = input("Type 'yes' to continue: ")
            if confirm.strip().lower() != "yes":
                self.stdout.write(self.style.WARNING("Aborted."))
                return

        DeliveryAttemptLog.objects.all().delete()
        Delivery.objects.all().delete()
        Event.objects.all().delete()
        Subscription.objects.all().delete()
        self.stdout.write(self.style.SUCCESS("Webhook data reset. Recreate subscriptions in Postman."))
