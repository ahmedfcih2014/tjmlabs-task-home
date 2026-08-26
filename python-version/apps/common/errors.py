from ninja.errors import HttpError


class AppError(HttpError):
    def __init__(self, status_code: int, code: str, message: str, details: dict | None = None) -> None:
        super().__init__(status_code, message)
        self.code = code
        self.details = details or {}


def error_response(exc: AppError) -> dict:
    return {
        "error": {
            "code": exc.code,
            "message": str(exc.message),
            "details": exc.details,
        }
    }
