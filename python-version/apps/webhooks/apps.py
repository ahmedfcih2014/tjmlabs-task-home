from django.apps import AppConfig


class WebhooksConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.webhooks"

    def ready(self) -> None:
        from django.db.backends.signals import connection_created
        from django.dispatch import receiver

        @receiver(connection_created)
        def enable_sqlite_wal(sender, connection, **kwargs) -> None:
            if connection.vendor == "sqlite":
                with connection.cursor() as cursor:
                    cursor.execute("PRAGMA journal_mode=WAL;")
