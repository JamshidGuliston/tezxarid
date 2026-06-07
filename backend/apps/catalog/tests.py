import pytest
from decimal import Decimal
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


@pytest.mark.django_db
def test_product_units_and_step():
    cat = Category.objects.create(name='Sut mahsulotlari')
    milk = Product.objects.create(
        name='Sut', unit=Product.Unit.LITER, category=cat, step=Decimal('0.5'))
    assert milk.unit == 'l'
    assert milk.get_unit_display() == 'литр'
    assert milk.step == Decimal('0.5')
    bread = Product.objects.create(name='Non', unit=Product.Unit.PIECE, category=cat)
    assert bread.step == Decimal('1')
    assert {u.value for u in Product.Unit} == {'kg', 'sht', 'l', 'g', 'boglam'}
