import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

import pytest
from apps.users.telegram import verify_telegram_init_data, TelegramAuthError


def build_init_data(bot_token: str, user: dict) -> str:
    """Construct a valid initData query string signed like Telegram does."""
    fields = {'auth_date': str(int(time.time())), 'query_id': 'abc', 'user': json.dumps(user)}
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


def test_verify_expired_init_data_raises():
    token = 'test-bot-token'
    user = {'id': 5, 'first_name': 'Old'}
    # build with a stale auth_date by signing manually
    import hashlib as _h, hmac as _m, json as _j
    from urllib.parse import urlencode as _u
    fields = {'auth_date': '1700000000', 'query_id': 'abc', 'user': _j.dumps(user)}
    dcs = '\n'.join(f'{k}={fields[k]}' for k in sorted(fields))
    secret = _m.new(b'WebAppData', token.encode(), _h.sha256).digest()
    fields['hash'] = _m.new(secret, dcs.encode(), _h.sha256).hexdigest()
    with pytest.raises(TelegramAuthError):
        verify_telegram_init_data(_u(fields), token)


def test_verify_non_dict_user_raises():
    token = 'test-bot-token'
    import hashlib as _h, hmac as _m, json as _j
    from urllib.parse import urlencode as _u
    import time as _t
    fields = {'auth_date': str(int(_t.time())), 'user': _j.dumps([1, 2, 3])}
    dcs = '\n'.join(f'{k}={fields[k]}' for k in sorted(fields))
    secret = _m.new(b'WebAppData', token.encode(), _h.sha256).digest()
    fields['hash'] = _m.new(secret, dcs.encode(), _h.sha256).hexdigest()
    with pytest.raises(TelegramAuthError):
        verify_telegram_init_data(_u(fields), token)
