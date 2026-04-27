from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta


@dataclass
class LoginLimitResult:
    allowed: bool
    captcha_required: bool
    retry_after_seconds: int = 0


class LoginAttemptLimiter:
    def __init__(self, window_seconds: int = 900, max_attempts: int = 8, captcha_after: int = 3) -> None:
        self.window = timedelta(seconds=window_seconds)
        self.max_attempts = max_attempts
        self.captcha_after = captcha_after
        self._attempts: dict[str, deque[datetime]] = defaultdict(deque)

    def check(self, key: str) -> LoginLimitResult:
        now = datetime.now(UTC)
        attempts = self._attempts[key]
        while attempts and now - attempts[0] > self.window:
            attempts.popleft()
        if len(attempts) >= self.max_attempts:
            retry_after = int((self.window - (now - attempts[0])).total_seconds())
            return LoginLimitResult(False, True, retry_after)
        return LoginLimitResult(True, len(attempts) >= self.captcha_after)

    def record_failure(self, key: str) -> LoginLimitResult:
        self._attempts[key].append(datetime.now(UTC))
        return self.check(key)

    def record_success(self, key: str) -> None:
        self._attempts.pop(key, None)


login_limiter = LoginAttemptLimiter()


def validate_captcha(captcha_token: str | None) -> bool:
    if captcha_token is None:
        return False
    return captcha_token.startswith("local-captcha-ok")
