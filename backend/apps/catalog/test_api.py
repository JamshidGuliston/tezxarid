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


@pytest.fixture
def catalog(city):
    other = City.objects.create(name='Samarqand', slug='samarqand')
    fruits = Category.objects.create(name='Mevalar', sort_order=1)
    grains = Category.objects.create(name='Don', sort_order=2)
    olma = Product.objects.create(name='Olma', unit=Product.Unit.KG, category=fruits)
    un = Product.objects.create(name='Un', unit=Product.Unit.KG, category=grains)
    CityProduct.objects.create(city=city, product=olma, price=19300)
    CityProduct.objects.create(city=city, product=un, price=7600, is_available=False)
    CityProduct.objects.create(city=other, product=olma, price=20000)
    return city, fruits, olma


@pytest.mark.django_db
def test_products_require_city_header(catalog):
    resp = APIClient().get('/api/products/')
    assert resp.status_code == 400


@pytest.mark.django_db
def test_products_list_uses_city_price_and_hides_unavailable(catalog):
    city, fruits, olma = catalog
    resp = APIClient().get('/api/products/', HTTP_X_CITY_ID=str(city.id))
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]['name'] == 'Olma'
    assert body[0]['price'] == '19300.00'
    assert body[0]['unit'] == 'kg'


@pytest.mark.django_db
def test_products_filter_by_category(catalog):
    city, fruits, olma = catalog
    resp = APIClient().get(f'/api/products/?category={fruits.id}', HTTP_X_CITY_ID=str(city.id))
    assert resp.status_code == 200
    assert [p['name'] for p in resp.json()] == ['Olma']


@pytest.mark.django_db
def test_products_search_by_name(catalog):
    city, fruits, olma = catalog
    resp = APIClient().get('/api/products/?search=olm', HTTP_X_CITY_ID=str(city.id))
    assert resp.status_code == 200
    assert [p['name'] for p in resp.json()] == ['Olma']
