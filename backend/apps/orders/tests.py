import pytest
from decimal import Decimal
from apps.cities.models import City
from apps.catalog.models import Category, Product, CityProduct
from apps.orders.models import Order, OrderItem


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
    assert order.status == Order.Status.NEW
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
