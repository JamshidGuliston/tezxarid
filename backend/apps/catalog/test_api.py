import pytest
from rest_framework.test import APIClient
from apps.cities.models import City
from apps.catalog.models import Category, Product, CityProduct


@pytest.fixture
def city(db):
    return City.objects.create(name='Toshkent', slug='toshkent')


@pytest.mark.django_db
def test_categories_list_returns_active_sorted():
    Category.objects.create(name='Sabzavotlar', sort_order=2)
    Category.objects.create(name='Mevalar', sort_order=1)
    Category.objects.create(name='Yashirin', sort_order=3, is_active=False)

    resp = APIClient().get('/api/categories/')

    assert resp.status_code == 200
    names = [c['name'] for c in resp.json()]
    assert names == ['Mevalar', 'Sabzavotlar']
    assert set(resp.json()[0].keys()) == {'id', 'name', 'image', 'sort_order'}
