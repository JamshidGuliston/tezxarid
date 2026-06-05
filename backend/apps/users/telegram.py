import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl


class TelegramAuthError(Exception):
    """Raised when Telegram initData fails HMAC verification or is malformed."""


def verify_telegram_init_data(init_data: str, bot_token: str, max_age_seconds: int = 600) -> dict:
    """Verify Telegram WebApp initData and return the parsed `user` dict.

    Raises TelegramAuthError on any verification or parsing failure.
    """
    pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = pairs.pop('hash', None)
    if not received_hash:
        raise TelegramAuthError('Missing hash in initData.')

    data_check_string = '\n'.join(f'{k}={pairs[k]}' for k in sorted(pairs))
    secret_key = hmac.new(b'WebAppData', bot_token.encode(), hashlib.sha256).digest()
    computed = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(computed, received_hash):
        raise TelegramAuthError('initData hash mismatch.')

    raw_auth_date = pairs.get('auth_date')
    try:
        auth_date = int(raw_auth_date)
    except (TypeError, ValueError):
        raise TelegramAuthError('Missing or invalid auth_date in initData.')
    if time.time() - auth_date > max_age_seconds:
        raise TelegramAuthError('initData has expired.')

    user_raw = pairs.get('user')
    if not user_raw:
        raise TelegramAuthError('Missing user in initData.')
    try:
        user = json.loads(user_raw)
    except json.JSONDecodeError:
        raise TelegramAuthError('Malformed user payload in initData.')
    if not isinstance(user, dict) or not isinstance(user.get('id'), int):
        raise TelegramAuthError('initData user is missing a valid id.')
    return user
