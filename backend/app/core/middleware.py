import logging
from collections.abc import Awaitable, Callable
from ipaddress import ip_address

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("agriscan.api")


def _is_potentially_trustworthy_origin(request: Request) -> bool:
    if request.url.scheme == "https":
        return True
    if request.url.scheme != "http":
        return False

    hostname = request.url.hostname
    if not hostname:
        return False

    normalized_host = hostname.rstrip(".").lower()
    if normalized_host == "localhost" or normalized_host.endswith(".localhost"):
        return True

    try:
        return ip_address(normalized_host).is_loopback
    except ValueError:
        return False


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        try:
            response = await call_next(request)
        except SQLAlchemyError as exc:
            logger.exception("Database error during %s %s", request.method, request.url.path, exc_info=exc)
            response = JSONResponse(
                status_code=503,
                content={"detail": "Database service is temporarily unavailable. Please try again."},
            )
        except Exception as exc:
            logger.exception("Unhandled error during %s %s", request.method, request.url.path, exc_info=exc)
            response = JSONResponse(status_code=500, content={"detail": "Unexpected server error. Please try again."})
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(self), geolocation=(self), microphone=()"
        if _is_potentially_trustworthy_origin(request):
            response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Resource-Policy"] = "same-site"
        response.headers.setdefault(
            "Content-Security-Policy",
            (
                "default-src 'self'; "
                "script-src 'self'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://tile.openstreetmap.org; "
                "connect-src 'self' https://nominatim.openstreetmap.org; "
                "font-src 'self' data:; "
                "worker-src 'self'; "
                "manifest-src 'self'; "
                "frame-ancestors 'none'; "
                "object-src 'none'; "
                "base-uri 'self'"
            ),
        )
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
        return response
