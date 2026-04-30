from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta


@dataclass
class LoginLimitResult:
    allowed: bool
    retry_after_seconds: int = 0


class LoginAttemptLimiter:
    def __init__(self, window_seconds: int = 900, max_attempts: int = 8) -> None:
        self.window = timedelta(seconds=window_seconds)
        self.max_attempts = max_attempts
        self._attempts: dict[str, deque[datetime]] = defaultdict(deque)

    def check(self, key: str) -> LoginLimitResult:
        now = datetime.now(UTC)
        attempts = self._attempts[key]
        while attempts and now - attempts[0] > self.window:
            attempts.popleft()
        if len(attempts) >= self.max_attempts:
            retry_after = int((self.window - (now - attempts[0])).total_seconds())
            return LoginLimitResult(False, retry_after)
        return LoginLimitResult(True)

    def record_failure(self, key: str) -> LoginLimitResult:
        self._attempts[key].append(datetime.now(UTC))
        return self.check(key)

    def record_success(self, key: str) -> None:
        self._attempts.pop(key, None)


login_limiter = LoginAttemptLimiter()
