from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid
from py_vapid.utils import b64urlencode


def main() -> None:
    vapid = Vapid()
    vapid.generate_keys()
    public_key = vapid.public_key.public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    private_key = vapid.private_key.private_numbers().private_value.to_bytes(32, "big")

    print("VAPID_SUBJECT=mailto:admin@example.com")
    print(f"VAPID_PUBLIC_KEY={b64urlencode(public_key)}")
    print(f"VAPID_PRIVATE_KEY={b64urlencode(private_key)}")


if __name__ == "__main__":
    main()
