from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.security import validate_strong_password


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=32)
    password: str = Field(min_length=12, max_length=128)
    role: str = Field(default="farmer", pattern="^(farmer|buyer|inspector)$")

    @field_validator("password")
    @classmethod
    def password_is_strong(cls, value: str) -> str:
        errors = validate_strong_password(value)
        if errors:
            raise ValueError(" ".join(errors))
        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    device_name: str | None = Field(default=None, max_length=160)
    remember_me: bool = False


class VerifyMFARequest(BaseModel):
    mfa_token: str
    code: str = Field(min_length=6, max_length=32)
    device_name: str | None = Field(default=None, max_length=160)
    remember_me: bool = False


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class LoginResponse(BaseModel):
    status: str
    user: dict | None = None
    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str = "bearer"
    mfa_token: str | None = None
    setup_token: str | None = None
    remember_me: bool = False
    message: str | None = None


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str | None = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class PasswordResetRequest(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=12, max_length=128)

    @field_validator("new_password")
    @classmethod
    def password_is_strong(cls, value: str) -> str:
        errors = validate_strong_password(value)
        if errors:
            raise ValueError(" ".join(errors))
        return value


class MFASetupResponse(BaseModel):
    secret: str
    otpauth_url: str
    qr_code_data_url: str


class MFASetupStartRequest(BaseModel):
    setup_token: str | None = None


class MFASetupVerifyRequest(BaseModel):
    setup_token: str | None = None
    code: str = Field(min_length=6, max_length=6)
    remember_me: bool = False


class MFASetupVerifyResponse(BaseModel):
    message: str
    recovery_codes: list[str]
    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str = "bearer"
    remember_me: bool = False


class MFADisableRequest(BaseModel):
    code: str = Field(min_length=6, max_length=32)
