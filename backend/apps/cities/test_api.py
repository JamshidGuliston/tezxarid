import pytest
from rest_framework.test import APIClient
from apps.cities.models import City


@pytest.mark.django_db
def test_cities_list_returns_only_active():
    City.objects.create(name='Toshkent', slug='toshkent')
    City.objects.create(name='Eski', slug='eski', is_active=False)

    resp = APIClient().get('/api/cities/')

    assert resp.status_code == 200
    names = [c['name'] for c in resp.json()]
    assert names == ['Toshkent']
    assert set(resp.json()[0].keys()) == {'id', 'name', 'slug'}
