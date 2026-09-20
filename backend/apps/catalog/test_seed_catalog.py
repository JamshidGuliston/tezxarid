from datetime import time
from decimal import Decimal
from io import StringIO

import pytest
from django.core.management import call_command

from apps.catalog.models import Category, CityProduct, Product
from apps.cities.models import City
from apps.orders.models import DeliverySlot


def run():
    out = StringIO()
    call_command('seed_catalog', stdout=out)
    return out.getvalue()


@pytest.mark.django_db
def test_seed_fills_categories_products_prices_and_slots_for_active_cities():
    guliston = City.objects.create(name='Guliston', slug='guliston')
    City.objects.create(name='Yopiq', slug='yopiq', is_active=False)

    out = run()

    assert Category.objects.count() >= 8
    assert Product.objects.count() >= 40
    # every product is priced in every ACTIVE city, and nowhere else
    assert CityProduct.objects.filter(city=guliston).count() == Product.objects.count()
    assert CityProduct.objects.exclude(city=guliston).count() == 0
    assert DeliverySlot.objects.filter(city=guliston).count() == 4
    assert DeliverySlot.objects.filter(city=guliston, start_time=time(9, 0), end_time=time(12, 0)).exists()
    assert 'Guliston' in out


@pytest.mark.django_db
def test_seed_is_idempotent_and_keeps_admin_edits():
    guliston = City.objects.create(name='Guliston', slug='guliston')
    run()
    olma = Product.objects.get(name='Olma')
    cp = CityProduct.objects.get(city=guliston, product=olma)
    cp.price = Decimal('99000.00')      # an admin changed the price
    cp.is_available = False
    cp.save()
    counts = (Category.objects.count(), Product.objects.count(),
              CityProduct.objects.count(), DeliverySlot.objects.count())

    run()

    cp.refresh_from_db()
    assert cp.price == Decimal('99000.00') and cp.is_available is False
    assert counts == (Category.objects.count(), Product.objects.count(),
                      CityProduct.objects.count(), DeliverySlot.objects.count())


@pytest.mark.django_db
def test_seed_units_and_steps_are_valid():
    City.objects.create(name='Guliston', slug='guliston')
    run()
    units = {choice for choice, _ in Product.Unit.choices}
    for p in Product.objects.all():
        assert p.unit in units, p.name
        assert p.step > 0, p.name
        assert p.category_id is not None, p.name
