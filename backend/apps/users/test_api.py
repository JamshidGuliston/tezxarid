import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from apps.users.test_telegram import build_init_data

User = get_user_model()


@pytest.mark.django_db
def test_telegram_auth_creates_user_and_returns_tokens(settings):
    settings.TELEGRAM_BOT_TOKEN = 'test-bot-token'
    init_data = build_init_data('test-bot-token', {
        'id': 777, 'first_name': 'Aziz', 'last_name': 'Aliyev', 'username': 'aziz',
    })
    resp = APIClient().post('/api/auth/telegram/', {'init_data': init_data}, format='json')
    assert resp.status_code == 200
    body = resp.json()
    assert 'access' in body and 'refresh' in body
    user = User.objects.get(telegram_id=777)
    assert user.first_name == 'Aziz'


@pytest.mark.django_db
def test_telegram_auth_is_idempotent_for_same_user(settings):
    settings.TELEGRAM_BOT_TOKEN = 'test-bot-token'
    init_data = build_init_data('test-bot-token', {'id': 777, 'first_name': 'Aziz'})
    client = APIClient()
    client.post('/api/auth/telegram/', {'init_data': init_data}, format='json')
    client.post('/api/auth/telegram/', {'init_data': init_data}, format='json')
    assert User.objects.filter(telegram_id=777).count() == 1


@pytest.mark.django_db
def test_telegram_auth_rejects_bad_signature(settings):
    settings.TELEGRAM_BOT_TOKEN = 'test-bot-token'
    init_data = build_init_data('test-bot-token', {'id': 1, 'first_name': 'X'}) + 'tamper'
    resp = APIClient().post('/api/auth/telegram/', {'init_data': init_data}, format='json')
    assert resp.status_code == 400
