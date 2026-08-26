import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass


@dataclass
class HttpDeliveryResult:
    http_status: int | None
    error: str
    duration_ms: int


def post_json(url: str, body_bytes: bytes, headers: dict[str, str], timeout_seconds: float) -> HttpDeliveryResult:
    started = time.monotonic()
    request = urllib.request.Request(url, data=body_bytes, method="POST")
    for key, value in headers.items():
        request.add_header(key, value)

    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            duration_ms = int((time.monotonic() - started) * 1000)
            return HttpDeliveryResult(http_status=response.status, error="", duration_ms=duration_ms)
    except urllib.error.HTTPError as exc:
        duration_ms = int((time.monotonic() - started) * 1000)
        return HttpDeliveryResult(http_status=exc.code, error=f"HTTP {exc.code}", duration_ms=duration_ms)
    except Exception as exc:
        duration_ms = int((time.monotonic() - started) * 1000)
        return HttpDeliveryResult(http_status=None, error=str(exc), duration_ms=duration_ms)


def build_event_body(event_id: str, event_type: str, payload: dict) -> bytes:
    body = {
        "id": event_id,
        "type": event_type,
        "payload": payload,
    }
    return json.dumps(body, separators=(",", ":"), sort_keys=True).encode("utf-8")
