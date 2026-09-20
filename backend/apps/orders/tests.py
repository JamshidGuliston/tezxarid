from datetime import date, time
from decimal import Decimal

import pytest
from django.conf import settings
from django.db import IntegrityError, transaction

from apps.cities.models import City
from apps.catalog.models import Category, Product, CityProduct
from apps.orders.models import DeliverySlot, Order, OrderItem


@pytest.fixture
def setup(db):
    city = City.objects.create(name='Toshkent', slug='toshkent')
    cat = Category.objects.create(name='Mevalar')
    product = Product.objects.create(name='Olma', unit=Product.Unit.KG, category=cat)
    cp = CityProduct.objects.create(city=city, product=product, price=19300)
    return city, cp


@pytest.mark.django_db
def test_order_defaults(setup):
    city, cp = setup
    order = Order.objects.create(
        city=city, customer_name='Aziz', phone='+998901112233', total=19300,
    )
    assert order.stage is None
    assert order.payment_type == Order.PaymentType.CASH
    assert str(order).startswith('Order #')


@pytest.mark.django_db
def test_order_item_snapshots_price(setup):
    city, cp = setup
    order = Order.objects.create(city=city, customer_name='Aziz', phone='+998901112233', total=38600)
    item = OrderItem.objects.create(order=order, city_product=cp, qty=2, price_snapshot=19300)
    assert item.qty == 2
    assert item.price_snapshot == 19300
    assert order.items.count() == 1

    # snapshot must stay fixed even if the catalog price later changes
    cp.price = 99999
    cp.save()
    item.refresh_from_db()
    assert item.price_snapshot == 19300


@pytest.mark.django_db
def test_order_item_accepts_fractional_qty(setup):
    city, cp = setup
    order = Order.objects.create(
        city=city, customer_name='Aziz', phone='+998901112233',
        address='Chilonzor 5', total=Decimal('9650'))
    item = OrderItem.objects.create(
        order=order, city_product=cp, qty=Decimal('0.5'), price_snapshot=cp.price)
    item.refresh_from_db()
    assert item.qty == Decimal('0.5')


@pytest.mark.django_db
def test_order_has_delivery_fields(setup):
    city, cp = setup
    order = Order.objects.create(
        city=city, customer_name='Aziz', phone='+998901112233',
        address='Chilonzor 5-uy', latitude=Decimal('41.311081'),
        longitude=Decimal('69.240562'), comment='Eshik oldida qoldiring', total=0)
    assert order.address == 'Chilonzor 5-uy'
    assert order.latitude == Decimal('41.311081')
    assert order.longitude == Decimal('69.240562')
    assert order.comment == 'Eshik oldida qoldiring'
    assert order.updated_at is not None


def test_timezone_is_tashkent():
    assert settings.TIME_ZONE == 'Asia/Tashkent'
    assert settings.DELIVERY_DAYS_AHEAD == 7


@pytest.mark.django_db
def test_delivery_slot_defaults_and_str(setup):
    city, _ = setup
    slot = DeliverySlot.objects.create(city=city, start_time=time(16, 0), end_time=time(19, 0))
    assert slot.lead_minutes == 120
    assert slot.is_active is True
    assert str(slot) == 'Toshkent 16:00–19:00'


@pytest.mark.django_db
def test_delivery_slot_rejects_end_before_start(setup):
    city, _ = setup
    with pytest.raises(IntegrityError), transaction.atomic():
        DeliverySlot.objects.create(city=city, start_time=time(19, 0), end_time=time(16, 0))


@pytest.mark.django_db
def test_delivery_slot_rejects_duplicate_window(setup):
    city, _ = setup
    DeliverySlot.objects.create(city=city, start_time=time(16, 0), end_time=time(19, 0))
    with pytest.raises(IntegrityError), transaction.atomic():
        DeliverySlot.objects.create(city=city, start_time=time(16, 0), end_time=time(19, 0))


@pytest.mark.django_db
def test_order_stores_delivery_snapshot(setup):
    city, cp = setup
    slot = DeliverySlot.objects.create(city=city, start_time=time(16, 0), end_time=time(19, 0))
    order = Order.objects.create(
        city=city, customer_name='Aziz', phone='+998901112233', total=0,
        delivery_slot=slot, delivery_date='2026-09-13',
        delivery_start=slot.start_time, delivery_end=slot.end_time)
    slot.delete()  # SET_NULL must keep the snapshot
    order.refresh_from_db()
    assert order.delivery_slot is None
    assert order.delivery_start == time(16, 0)
    assert order.delivery_end == time(19, 0)
    assert order.delivery_date == date(2026, 9, 13)
