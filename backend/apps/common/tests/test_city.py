import pytest
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIRequestFactory
from apps.cities.models import City
from apps.common.city import resolve_city


@pytest.mark.django_db
def test_resolve_city_from_header():
    city = City.objects.create(name='Toshkent', slug='toshkent')
    request = APIRequestFactory().get('/api/products/', HTTP_X_CITY_ID=str(city.id))
    assert resolve_city(request).id == city.id


@pytest.mark.django_db
def test_resolve_city_missing_header_raises():
    request = APIRequestFactory().get('/api/products/')
    with pytest.raises(ValidationError):
        resolve_city(request)


@pytest.mark.django_db
def test_resolve_city_unknown_id_raises():
    request = APIRequestFactory().get('/api/products/', HTTP_X_CITY_ID='999999')
    with pytest.raises(ValidationError):
        resolve_city(request)


@pytest.mark.django_db
def test_resolve_city_inactive_raises():
    city = City.objects.create(name='Eski', slug='eski', is_active=False)
    request = APIRequestFactory().get('/api/products/', HTTP_X_CITY_ID=str(city.id))
    with pytest.raises(ValidationError):
        resolve_city(request)
