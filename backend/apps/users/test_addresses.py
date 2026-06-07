import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from apps.cities.models import City
from apps.users.models import Address

User = get_user_model()


def auth_client(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')
    return client


@pytest.fixture
def setup(db):
    city = City.objects.create(name='Toshkent', slug='toshkent')
    user = User.objects.create_user(username='aziz', password='x', telegram_id=10)
    return city, user


@pytest.mark.django_db
def test_address_list_requires_auth(setup):
    resp = APIClient().get('/api/addresses/')
    assert resp.status_code == 401


@pytest.mark.django_db
def test_create_and_list_own_addresses(setup):
    city, user = setup
    client = auth_client(user)
    create = client.post('/api/addresses/', {
        'city': city.id, 'title': 'Uy', 'address': 'Chilonzor 5',
        'latitude': '41.311081', 'longitude': '69.240562', 'is_default': True,
    }, format='json')
    assert create.status_code == 201
    resp = client.get('/api/addresses/')
    assert resp.status_code == 200
    assert [a['title'] for a in resp.json()] == ['Uy']
    assert resp.json()[0]['address'] == 'Chilonzor 5'


@pytest.mark.django_db
def test_user_cannot_see_others_addresses(setup):
    city, user = setup
    other = User.objects.create_user(username='other', password='x', telegram_id=20)
    Address.objects.create(user=other, city=city, address='Boshqa manzil')
    resp = auth_client(user).get('/api/addresses/')
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.django_db
def test_delete_own_address(setup):
    city, user = setup
    addr = Address.objects.create(user=user, city=city, address="O'chiriladi")
    resp = auth_client(user).delete(f'/api/addresses/{addr.id}/')
    assert resp.status_code == 204
    assert Address.objects.filter(pk=addr.id).count() == 0


@pytest.mark.django_db
def test_cannot_delete_others_address(setup):
    city, user = setup
    other = User.objects.create_user(username='other', password='x', telegram_id=20)
    addr = Address.objects.create(user=other, city=city, address='Himoyalangan')
    resp = auth_client(user).delete(f'/api/addresses/{addr.id}/')
    assert resp.status_code == 404
    assert Address.objects.filter(pk=addr.id).count() == 1


@pytest.mark.django_db
def test_setting_new_default_unsets_previous(setup):
    city, user = setup
    client = auth_client(user)
    a1 = Address.objects.create(user=user, city=city, address='Birinchi', is_default=True)
    # create a second default via the API
    resp = client.post('/api/addresses/', {
        'city': city.id, 'address': 'Ikkinchi', 'is_default': True,
    }, format='json')
    assert resp.status_code == 201
    a1.refresh_from_db()
    assert a1.is_default is False
    assert Address.objects.filter(user=user, is_default=True).count() == 1


@pytest.mark.django_db
def test_cannot_update_others_address(setup):
    city, user = setup
    other = User.objects.create_user(username='other', password='x', telegram_id=20)
    addr = Address.objects.create(user=other, city=city, address='Himoyalangan', title='Eski')
    resp = auth_client(user).patch(f'/api/addresses/{addr.id}/', {'title': 'Buzildi'}, format='json')
    assert resp.status_code == 404
    addr.refresh_from_db()
    assert addr.title == 'Eski'  # unchanged


@pytest.mark.django_db
def test_retrieve_own_address_detail(setup):
    city, user = setup
    addr = Address.objects.create(user=user, city=city, address='Mening manzilim', title='Uy')
    resp = auth_client(user).get(f'/api/addresses/{addr.id}/')
    assert resp.status_code == 200
    assert resp.json()['title'] == 'Uy'
    assert resp.json()['address'] == 'Mening manzilim'
