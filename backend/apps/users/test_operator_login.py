import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from apps.cities.models import City

User = get_user_model()
LOGIN = '/api/auth/login/'


@pytest.fixture
def city(db):
    return City.objects.create(name='Guliston', slug='guliston')


@pytest.fixture
def operator(city):
    return User.objects.create_user(username='op', password='secret123', role=User.Role.CITY_ADMIN,
                                    city=city, is_staff=True)


@pytest.mark.django_db
def test_login_returns_tokens_and_profile(operator, city):
    res = APIClient().post(LOGIN, {'username': 'op', 'password': 'secret123'}, format='json')
    assert res.status_code == 200
    body = res.json()
    assert body['access'] and body['refresh']
    assert body['user'] == {'id': operator.id, 'username': 'op', 'first_name': '',
                            'role': 'city_admin', 'city': city.id, 'city_name': 'Guliston'}


@pytest.mark.django_db
def test_login_rejects_a_wrong_password(operator):
    res = APIClient().post(LOGIN, {'username': 'op', 'password': 'nope'}, format='json')
    assert res.status_code == 400


@pytest.mark.django_db
def test_login_rejects_a_customer_account(city):
    User.objects.create_user(username='cust', password='secret123')
    res = APIClient().post(LOGIN, {'username': 'cust', 'password': 'secret123'}, format='json')
    assert res.status_code == 403
