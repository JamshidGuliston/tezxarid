import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from apps.catalog.models import Category, CityProduct, Product
from apps.cities.models import City
from apps.orders.models import Order, OrderStage
from apps.users.models import Address

User = get_user_model()


def client_for(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')
    return client


@pytest.fixture
def city(db):
    return City.objects.create(name='Guliston', slug='guliston')


@pytest.fixture
def operator(city):
    return User.objects.create_user(username='op', password='x', role=User.Role.CITY_ADMIN, city=city, is_staff=True)


@pytest.mark.django_db
def test_customers_list_counts_orders_and_spend(operator, city):
    buyer = User.objects.create_user(username='tg_1', telegram_id=1, first_name='Aziz', phone='+998901234567')
    stage = OrderStage.objects.get(city=city, code='new')
    Order.objects.create(city=city, user=buyer, customer_name='Aziz', phone='+998901234567', total='10000.00', stage=stage)
    Order.objects.create(city=city, user=buyer, customer_name='Aziz', phone='+998901234567', total='5000.00', stage=stage)
    Order.objects.create(city=city, customer_name='Mehmon', phone='+998911111111', total='7000.00', stage=stage)
    body = client_for(operator).get('/api/operator/customers/').json()
    assert body['count'] == 1                      # the guest order has no user
    row = body['results'][0]
    assert row['id'] == buyer.id and row['orders_count'] == 2 and row['orders_total'] == '15000.00'
    assert row['phone'] == '+998901234567' and row['name'] == 'Aziz'


@pytest.mark.django_db
def test_customers_list_includes_profile_city_members_and_searches(operator, city):
    User.objects.create_user(username='tg_2', telegram_id=2, first_name='Dilnoza',
                            phone='+998977654321', city=city)
    body = client_for(operator).get('/api/operator/customers/?q=dil').json()
    assert body['count'] == 1 and body['results'][0]['name'] == 'Dilnoza'
    assert body['results'][0]['orders_count'] == 0


@pytest.mark.django_db
def test_customer_detail_returns_addresses_and_city_orders(operator, city):
    other = City.objects.create(name='Toshkent', slug='toshkent')
    buyer = User.objects.create_user(username='tg_3', telegram_id=3, first_name='Aziz')
    Address.objects.create(user=buyer, city=city, title='Uy', address='Chilonzor 5', is_default=True)
    Order.objects.create(city=city, user=buyer, customer_name='Aziz', phone='+998901234567',
                         total='10000.00', stage=OrderStage.objects.get(city=city, code='new'))
    Order.objects.create(city=other, user=buyer, customer_name='Aziz', phone='+998901234567',
                         total='9000.00', stage=OrderStage.objects.get(city=other, code='new'))
    body = client_for(operator).get(f'/api/operator/customers/{buyer.id}/').json()
    assert body['id'] == buyer.id
    assert [a['title'] for a in body['addresses']] == ['Uy']
    assert len(body['orders']) == 1 and body['orders'][0]['total'] == '10000.00'


@pytest.mark.django_db
def test_operator_product_search_is_city_scoped(operator, city):
    other = City.objects.create(name='Toshkent', slug='toshkent')
    category = Category.objects.create(name='Mevalar')
    olma = Product.objects.create(name='Olma', unit='kg', category=category)
    banan = Product.objects.create(name='Banan', unit='kg', category=category)
    CityProduct.objects.create(city=city, product=olma, price='19300.00')
    CityProduct.objects.create(city=other, product=banan, price='24500.00')
    body = client_for(operator).get('/api/operator/products/?search=an').json()
    assert body == []
    body = client_for(operator).get('/api/operator/products/?search=ol').json()
    assert len(body) == 1 and body[0]['name'] == 'Olma' and body[0]['price'] == '19300.00'
