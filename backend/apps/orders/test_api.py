import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from apps.cities.models import City
from apps.catalog.models import Category, Product, CityProduct
from apps.orders.models import Order

User = get_user_model()


@pytest.fixture
def shop(db):
    tashkent = City.objects.create(name='Toshkent', slug='toshkent')
    samarkand = City.objects.create(name='Samarqand', slug='samarqand')
    cat = Category.objects.create(name='Mevalar')
    olma = Product.objects.create(name='Olma', unit=Product.Unit.KG, category=cat)
    cp_tk = CityProduct.objects.create(city=tashkent, product=olma, price=19300)
    cp_sm = CityProduct.objects.create(city=samarkand, product=olma, price=20000)
    return tashkent, samarkand, cp_tk, cp_sm


@pytest.mark.django_db
def test_create_order_computes_total_server_side(shop):
    tashkent, _, cp_tk, _ = shop
    payload = {
        'customer_name': 'Aziz',
        'phone': '+998901112233',
        'address': 'Chilonzor 5',
        'items': [{'city_product': cp_tk.id, 'qty': 2}],
    }
    resp = APIClient().post('/api/orders/', payload, format='json',
                            HTTP_X_CITY_ID=str(tashkent.id))
    assert resp.status_code == 201
    body = resp.json()
    assert body['total'] == '38600.00'
    assert body['status'] == 'new'
    order = Order.objects.get(pk=body['id'])
    assert order.items.count() == 1
    assert order.items.first().price_snapshot == cp_tk.price


@pytest.mark.django_db
def test_create_order_rejects_city_product_from_other_city(shop):
    tashkent, _, _, cp_sm = shop
    payload = {
        'customer_name': 'Aziz',
        'phone': '+998901112233',
        'address': 'Chilonzor 5',
        'items': [{'city_product': cp_sm.id, 'qty': 1}],
    }
    resp = APIClient().post('/api/orders/', payload, format='json',
                            HTTP_X_CITY_ID=str(tashkent.id))
    assert resp.status_code == 400
    assert Order.objects.count() == 0


@pytest.mark.django_db
def test_create_order_requires_city_header(shop):
    tashkent, _, cp_tk, _ = shop
    payload = {'customer_name': 'A', 'phone': '+9989', 'address': 'Chilonzor 5', 'items': [{'city_product': cp_tk.id, 'qty': 1}]}
    resp = APIClient().post('/api/orders/', payload, format='json')
    assert resp.status_code == 400


@pytest.mark.django_db
def test_create_order_requires_at_least_one_item(shop):
    tashkent, _, _, _ = shop
    payload = {'customer_name': 'A', 'phone': '+9989', 'address': 'Chilonzor 5', 'items': []}
    resp = APIClient().post('/api/orders/', payload, format='json',
                            HTTP_X_CITY_ID=str(tashkent.id))
    assert resp.status_code == 400


@pytest.mark.django_db
def test_order_list_requires_auth_and_returns_only_own(shop):
    tashkent, _, cp_tk, _ = shop
    owner = User.objects.create_user(username='owner', password='x', telegram_id=1)
    other = User.objects.create_user(username='other', password='x', telegram_id=2)
    Order.objects.create(city=tashkent, user=owner, customer_name='Owner', phone='1', total=10)
    Order.objects.create(city=tashkent, user=other, customer_name='Other', phone='2', total=20)

    anon = APIClient().get('/api/orders/')
    assert anon.status_code == 401

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(owner).access_token}')
    resp = client.get('/api/orders/')
    assert resp.status_code == 200
    assert [o['customer_name'] for o in resp.json()] == ['Owner']


@pytest.mark.django_db
def test_create_order_rejects_unavailable_item(shop):
    tashkent, _, cp_tk, _ = shop
    cp_tk.is_available = False
    cp_tk.save(update_fields=['is_available'])
    payload = {
        'customer_name': 'Aziz',
        'phone': '+998901112233',
        'address': 'Chilonzor 5',
        'items': [{'city_product': cp_tk.id, 'qty': 1}],
    }
    resp = APIClient().post('/api/orders/', payload, format='json',
                            HTTP_X_CITY_ID=str(tashkent.id))
    assert resp.status_code == 400
    assert Order.objects.count() == 0


@pytest.mark.django_db
def test_create_order_rejects_inactive_product(shop):
    tashkent, _, cp_tk, _ = shop
    product = cp_tk.product
    product.is_active = False
    product.save(update_fields=['is_active'])
    payload = {
        'customer_name': 'Aziz',
        'phone': '+998901112233',
        'address': 'Chilonzor 5',
        'items': [{'city_product': cp_tk.id, 'qty': 1}],
    }
    resp = APIClient().post('/api/orders/', payload, format='json',
                            HTTP_X_CITY_ID=str(tashkent.id))
    assert resp.status_code == 400
    assert Order.objects.count() == 0


@pytest.mark.django_db
def test_create_order_requires_address(shop):
    tashkent, _, cp_tk, _ = shop
    payload = {'customer_name': 'Aziz', 'phone': '+998901112233',
               'items': [{'city_product': cp_tk.id, 'qty': 1}]}  # no address
    resp = APIClient().post('/api/orders/', payload, format='json',
                            HTTP_X_CITY_ID=str(tashkent.id))
    assert resp.status_code == 400


@pytest.mark.django_db
def test_create_order_accepts_fractional_qty_matching_step(shop):
    from decimal import Decimal
    tashkent, _, cp_tk, _ = shop
    cp_tk.product.step = Decimal('0.5')
    cp_tk.product.save(update_fields=['step'])
    payload = {'customer_name': 'Aziz', 'phone': '+998901112233',
               'address': 'Chilonzor 5',
               'items': [{'city_product': cp_tk.id, 'qty': '0.5'}]}
    resp = APIClient().post('/api/orders/', payload, format='json',
                            HTTP_X_CITY_ID=str(tashkent.id))
    assert resp.status_code == 201
    assert resp.json()['total'] == '9650.00'  # 19300 * 0.5


@pytest.mark.django_db
def test_create_order_rejects_qty_not_multiple_of_step(shop):
    from decimal import Decimal
    tashkent, _, cp_tk, _ = shop
    cp_tk.product.step = Decimal('0.5')
    cp_tk.product.save(update_fields=['step'])
    payload = {'customer_name': 'Aziz', 'phone': '+998901112233',
               'address': 'Chilonzor 5',
               'items': [{'city_product': cp_tk.id, 'qty': '0.3'}]}
    resp = APIClient().post('/api/orders/', payload, format='json',
                            HTTP_X_CITY_ID=str(tashkent.id))
    assert resp.status_code == 400


@pytest.mark.django_db
def test_create_order_with_saved_address_id_snapshots(shop):
    from decimal import Decimal
    from django.contrib.auth import get_user_model
    from rest_framework_simplejwt.tokens import RefreshToken
    from apps.users.models import Address
    from apps.orders.models import Order
    User = get_user_model()
    tashkent, _, cp_tk, _ = shop
    user = User.objects.create_user(username='aziz', password='x', telegram_id=10)
    addr = Address.objects.create(user=user, city=tashkent, title='Uy',
                                  address='Yunusobod 12', latitude=Decimal('41.3'),
                                  longitude=Decimal('69.2'))
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')
    payload = {'customer_name': 'Aziz', 'phone': '+998901112233',
               'address_id': addr.id,
               'items': [{'city_product': cp_tk.id, 'qty': 1}]}
    resp = client.post('/api/orders/', payload, format='json',
                       HTTP_X_CITY_ID=str(tashkent.id))
    assert resp.status_code == 201
    order = Order.objects.get(pk=resp.json()['id'])
    assert order.address == 'Yunusobod 12'
    assert order.latitude == Decimal('41.300000')
    assert order.address_ref_id == addr.id
