import datetime as dt
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from apps.catalog.models import Category, CityProduct, Product
from apps.cities.models import City
from apps.orders.models import DeliverySlot, Order, OrderItem, OrderStage

User = get_user_model()


def client_for(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')
    return client


@pytest.fixture
def city(db):
    return City.objects.create(name='Guliston', slug='guliston')


@pytest.fixture
def other_city(db):
    return City.objects.create(name='Toshkent', slug='toshkent')


@pytest.fixture
def operator(city):
    return User.objects.create_user(username='op', password='x', role=User.Role.CITY_ADMIN, city=city, is_staff=True)


@pytest.fixture
def product(city):
    category = Category.objects.create(name='Mevalar')
    item = Product.objects.create(name='Olma', unit='kg', category=category)
    return CityProduct.objects.create(city=city, product=item, price='19300.00')


def make_order(city, code='new', name='Aziz', phone='+998901234567', product=None,
              delivery_date=dt.date(2026, 9, 21)):
    order = Order.objects.create(
        city=city, customer_name=name, phone=phone, address='Chilonzor 5', total='19300.00',
        delivery_date=delivery_date, delivery_start=dt.time(9), delivery_end=dt.time(12),
        stage=OrderStage.objects.get(city=city, code=code))
    if product is not None:
        OrderItem.objects.create(order=order, city_product=product, qty='1.000', price_snapshot=product.price)
    return order


@pytest.mark.django_db
def test_operator_endpoints_reject_customers_and_anonymous(city):
    customer = User.objects.create_user(username='cust', password='x')
    assert APIClient().get('/api/operator/orders/').status_code == 401
    assert client_for(customer).get('/api/operator/orders/').status_code == 403


@pytest.mark.django_db
def test_stages_list_returns_the_operator_city_pipeline(operator, city):
    body = client_for(operator).get('/api/operator/stages/').json()
    assert [s['code'] for s in body] == ['new', 'accepted', 'preparing', 'delivering', 'done', 'canceled']
    assert body[0]['name'] == 'Yangi' and body[0]['is_initial'] is True


@pytest.mark.django_db
def test_orders_list_is_scoped_counted_and_filterable(operator, city, other_city, product):
    make_order(city, 'new', product=product)
    make_order(city, 'accepted', name='Dilnoza', phone='+998977654321')
    make_order(other_city, 'new', name='Begona')
    body = client_for(operator).get('/api/operator/orders/').json()
    assert body['count'] == 2
    assert 'Begona' not in str(body)
    assert body['counts']['new'] == 1 and body['counts']['accepted'] == 1 and body['counts']['done'] == 0
    assert body['results'][0]['items_count'] in (0, 1)

    only_new = client_for(operator).get('/api/operator/orders/?stage=new').json()
    assert only_new['count'] == 1 and only_new['results'][0]['stage'] == 'new'

    found = client_for(operator).get('/api/operator/orders/?q=977654').json()
    assert found['count'] == 1 and found['results'][0]['customer_name'] == 'Dilnoza'

    by_date = client_for(operator).get('/api/operator/orders/?date=2026-09-21').json()
    assert by_date['count'] == 2


@pytest.mark.django_db
def test_orders_counts_follow_the_date_filter(operator, city):
    make_order(city, 'new', delivery_date=dt.date(2026, 9, 21))
    make_order(city, 'accepted', name='Dilnoza', phone='+998977654321', delivery_date=dt.date(2026, 9, 22))
    body = client_for(operator).get('/api/operator/orders/?date=2026-09-21').json()
    assert body['count'] == 1
    assert body['counts']['new'] == 1 and body['counts']['accepted'] == 0


@pytest.mark.django_db
def test_order_detail_has_items_customer_and_events(operator, city, product):
    order = make_order(city, product=product)
    body = client_for(operator).get(f'/api/operator/orders/{order.id}/').json()
    assert body['id'] == order.id
    assert body['stage'] == 'new' and body['stage_name'] == 'Yangi'
    assert body['items'][0]['name'] == 'Olma' and body['items'][0]['unit'] == 'kg'
    assert body['items'][0]['line_total'] == '19300.00'
    assert body['delivery_window'] == '09:00 – 12:00'
    assert body['delivery_start'] == '09:00' and body['delivery_end'] == '12:00'   # no seconds on the receipt
    assert body['events'] == []


@pytest.mark.django_db
def test_another_citys_order_is_not_found(operator, other_city):
    order = make_order(other_city)
    assert client_for(operator).get(f'/api/operator/orders/{order.id}/').status_code == 404
