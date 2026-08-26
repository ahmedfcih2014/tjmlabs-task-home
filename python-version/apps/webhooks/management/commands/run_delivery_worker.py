import time

from django.core.management.base import BaseCommand

from apps.webhooks.delivery.worker import DeliveryWorker


class Command(BaseCommand):
    help = "Poll and deliver pending webhook deliveries."

    def add_arguments(self, parser) -> None:
        parser.add_argument("--once", action="store_true", help="Process one batch and exit")
        parser.add_argument("--poll-interval", type=float, default=1.0, help="Seconds to sleep when queue is empty")
        parser.add_argument("--batch-size", type=int, default=10, help="Max deliveries per batch")

    def handle(self, *args, **options) -> None:
        worker = DeliveryWorker(batch_size=options["batch_size"])
        self.stdout.write(self.style.SUCCESS("Delivery worker started"))

        while True:
            processed = worker.run_once()
            if processed:
                self.stdout.write(f"Processed {processed} delivery attempt(s)")
            if options["once"]:
                break
            if processed == 0:
                time.sleep(options["poll_interval"])
