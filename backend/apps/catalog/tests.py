import pytest
from django.db import IntegrityError
from apps.cities.models import City
from apps.catalog.models import Category, Product, CityProduct


@pytest.fixture
def city(db):
    return City.objects.create(name='Toshkent', slug='toshkent')


@pytest.fixture
def apple(db):
    cat = Category.objects.create(name='Mevalar', sort_order=1)
    return Product.objects.create(name='Olma Saltanat', unit=Product.Unit.KG, category=cat)


@pytest.mark.django_db
def test_city_product_holds_price(city, apple):
    cp = CityProduct.objects.create(city=city, product=apple, price=19300)
    assert cp.is_available is True
    assert str(cp) == 'Olma Saltanat @ Toshkent'
    assert cp.price == 19300


@pytest.mark.django_db(transaction=True)
def test_city_product_unique_per_city(city, apple):
    CityProduct.objects.create(city=city, product=apple, price=19300)
    with pytest.raises(IntegrityError):
        CityProduct.objects.create(city=city, product=apple, price=20000)
