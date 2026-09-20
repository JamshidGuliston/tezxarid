import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from apps.cities.models import City

User = get_user_model()


def auth_client(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')
    return client


@pytest.fixture
def user(db):
    return User.objects.create_user(username='tg_1', telegram_id=1, first_name='Aziz', last_name='Karimov')


@pytest.mark.django_db
def test_me_requires_auth():
    assert APIClient().get('/api/auth/me/').status_code == 401
    assert APIClient().patch('/api/auth/me/', {'phone': '+998901234567'}, format='json').status_code == 401


@pytest.mark.django_db
def test_me_returns_profile_fields(user):
    body = auth_client(user).get('/api/auth/me/').json()
    assert body['id'] == user.id
    assert body['telegram_id'] == 1
    assert body['first_name'] == 'Aziz' and body['last_name'] == 'Karimov'
    assert body['phone'] == '' and body['city'] is None
    assert body['date_joined'].endswith('+05:00')
    assert set(body) == {'id', 'telegram_id', 'first_name', 'last_name', 'phone', 'city', 'date_joined'}


@pytest.mark.django_db
def test_me_patch_updates_name_phone_and_city(user):
    city = City.objects.create(name='Guliston', slug='guliston')
    resp = auth_client(user).patch('/api/auth/me/', {
        'first_name': 'Anvar', 'last_name': '', 'phone': '+998901234567', 'city': city.id,
    }, format='json')
    assert resp.status_code == 200, resp.json()
    user.refresh_from_db()
    assert (user.first_name, user.last_name, user.phone, user.city_id) == ('Anvar', '', '+998901234567', city.id)


@pytest.mark.django_db
@pytest.mark.parametrize('phone', ['90 123', '+998 90 111 22 33', '12345678'])
def test_me_patch_rejects_bad_phone(user, phone):
    resp = auth_client(user).patch('/api/auth/me/', {'phone': phone}, format='json')
    assert resp.status_code == 400 and 'phone' in resp.json()


@pytest.mark.django_db
def test_me_patch_allows_clearing_phone(user):
    user.phone = '+998901234567'
    user.save(update_fields=['phone'])
    resp = auth_client(user).patch('/api/auth/me/', {'phone': ''}, format='json')
    assert resp.status_code == 200 and resp.json()['phone'] == ''


@pytest.mark.django_db
def test_me_patch_rejects_inactive_city_and_readonly_fields(user):
    closed = City.objects.create(name='Yopiq', slug='yopiq', is_active=False)
    resp = auth_client(user).patch('/api/auth/me/', {'city': closed.id}, format='json')
    assert resp.status_code == 400 and 'city' in resp.json()
    resp = auth_client(user).patch('/api/auth/me/', {'telegram_id': 999}, format='json')
    assert resp.status_code == 200
    user.refresh_from_db()
    assert user.telegram_id == 1
