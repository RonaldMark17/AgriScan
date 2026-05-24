from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from math import ceil


@dataclass
class LoginLimitResult:
    allowed: bool
    retry_after_seconds: int = 0
    locked_until: datetime | None = None
    lockout_level: int = 0


class LoginAttemptLimiter:
    def __init__(
        self,
        window_seconds: int = 900,
        max_attempts: int = 3,
        lockout_seconds: tuple[int, ...] = (60, 300, 900),
    ) -> None:
        self.window = timedelta(seconds=window_seconds)
        self.max_attempts = max_attempts
        self.lockout_durations = tuple(timedelta(seconds=seconds) for seconds in lockout_seconds)
        self._attempts: dict[str, deque[datetime]] = defaultdict(deque)
        self._locked_until: dict[str, datetime] = {}
        self._lockout_levels: dict[str, int] = defaultdict(int)

    def check(self, key: str) -> LoginLimitResult:
        now = datetime.now(UTC)
        locked_until = self._locked_until.get(key)
        if locked_until and locked_until > now:
            retry_after = ceil((locked_until - now).total_seconds())
            return LoginLimitResult(False, retry_after, locked_until, self._lockout_levels[key])
        if locked_until:
            self._locked_until.pop(key, None)

        attempts = self._attempts[key]
        while attempts and now - attempts[0] > self.window:
            attempts.popleft()
        return LoginLimitResult(True)

    def record_failure(self, key: str) -> LoginLimitResult:
        limit = self.check(key)
        if not limit.allowed:
            return limit

        now = datetime.now(UTC)
        attempts = self._attempts[key]
        attempts.append(now)
        while attempts and now - attempts[0] > self.window:
            attempts.popleft()

        if len(attempts) < self.max_attempts:
            return LoginLimitResult(True)

        level = min(self._lockout_levels[key] + 1, len(self.lockout_durations))
        self._lockout_levels[key] = level
        locked_until = now + self.lockout_durations[level - 1]
        self._locked_until[key] = locked_until
        attempts.clear()
        retry_after = ceil((locked_until - now).total_seconds())
        return LoginLimitResult(False, retry_after, locked_until, level)

    def record_success(self, key: str) -> None:
        self._attempts.pop(key, None)
        self._locked_until.pop(key, None)
        self._lockout_levels.pop(key, None)


login_limiter = LoginAttemptLimiter()
