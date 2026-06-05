import hashlib
import hmac
import json
from urllib.parse import urlencode

import pytest
from apps.users.telegram import verify_telegram_init_data, TelegramAuthError


def build_init_data(bot_token: str, user: dict) -> str:
    """Construct a valid initData query string signed like Telegram does."""
    fields = {'auth_date': '1700000000', 'query_id': 'abc', 'user': json.dumps(user)}
    data_check_string = '\n'.join(f'{k}={fields[k]}' for k in sorted(fields))
    secret_key = hmac.new(b'WebAppData', bot_token.encode(), hashlib.sha256).digest()
    h = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    fields['hash'] = h
    return urlencode(fields)


def test_verify_valid_init_data_returns_user():
    token = 'test-bot-token'
    user = {'id': 12345, 'first_name': 'Aziz', 'username': 'aziz'}
    init_data = build_init_data(token, user)
    result = verify_telegram_init_data(init_data, token)
    assert result['id'] == 12345
    assert result['first_name'] == 'Aziz'


def test_verify_tampered_hash_raises():
    token = 'test-bot-token'
    user = {'id': 12345, 'first_name': 'Aziz'}
    init_data = build_init_data(token, user) + '0'  # corrupt the hash tail
    with pytest.raises(TelegramAuthError):
        verify_telegram_init_data(init_data, token)


def test_verify_wrong_token_raises():
    user = {'id': 1, 'first_name': 'X'}
    init_data = build_init_data('test-bot-token', user)
    with pytest.raises(TelegramAuthError):
        verify_telegram_init_data(init_data, 'different-token')
