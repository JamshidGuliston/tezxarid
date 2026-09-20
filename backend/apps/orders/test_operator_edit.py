import datetime as dt
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from apps.catalog.models import Category, CityProduct, Product
from apps.cities.models import City
from apps.orders.models import DeliverySlot, Order, OrderEvent, OrderItem, OrderStage

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


@pytest.fixture
def products(city):
    category = Category.objects.create(name='Mevalar')
    olma = Product.objects.create(name='Olma', unit='kg', step='0.5', category=category)
    non = Product.objects.create(name='Non', unit='sht', step='1', category=category)
    return (CityProduct.objects.create(city=city, product=olma, price='10000.00'),
            CityProduct.objects.create(city=city, product=non, price='3000.00'))


@pytest.fixture
def order(city, products):
    olma, _ = products
    o = Order.objects.create(city=city, customer_name='Aziz', phone='+998901234567', address='Chilonzor 5',
                             total='20000.00', stage=OrderStage.objects.get(city=city, code='new'))
    OrderItem.objects.create(order=o, city_product=olma, qty='2.000', price_snapshot='10000.00')
    return o


@pytest.mark.django_db
def test_patch_updates_customer_fields_and_logs_an_edit(operator, order):
    res = client_for(operator).patch(f'/api/operator/orders/{order.id}/',
                                     {'customer_name': 'Aziz Karimov', 'comment': 'Eshik oldiga'}, format='json')
    assert res.status_code == 200
    order.refresh_from_db()
    assert order.customer_name == 'Aziz Karimov' and order.comment == 'Eshik oldiga'
    assert order.events.filter(kind=OrderEvent.Kind.EDITED).count() == 1


@pytest.mark.django_db
def test_patch_reassigns_the_delivery_slot_and_resnapshots_the_window(operator, order, city):
    slot = DeliverySlot.objects.create(city=city, start_time=dt.time(16), end_time=dt.time(19))
    res = client_for(operator).patch(f'/api/operator/orders/{order.id}/',
                                     {'delivery_slot_id': slot.id, 'delivery_date': '2026-09-25'}, format='json')
    assert res.status_code == 200
    order.refresh_from_db()
    assert order.delivery_slot_id == slot.id
    assert order.delivery_start == dt.time(16) and order.delivery_end == dt.time(19)


@pytest.mark.django_db
def test_items_are_replaced_with_kept_prices_and_a_new_total(operator, order, products):
    olma, non = products
    non.price = '3500.00'
    non.save(update_fields=['price'])
    res = client_for(operator).put(f'/api/operator/orders/{order.id}/items/',
                                   {'items': [{'city_product': olma.id, 'qty': '1.500'},
                                              {'city_product': non.id, 'qty': '2.000'}]}, format='json')
    assert res.status_code == 200
    order.refresh_from_db()
    lines = {i.city_product_id: i for i in order.items.all()}
    assert str(lines[olma.id].price_snapshot) == '10000.00'     # existing line keeps its price
    assert str(lines[non.id].price_snapshot) == '3500.00'       # new line takes the current price
    assert str(order.total) == '22000.00'                       # 1.5*10000 + 2*3500
    assert order.events.filter(kind=OrderEvent.Kind.EDITED).exists()


@pytest.mark.django_db
def test_items_reject_a_bad_step_and_an_empty_list(operator, order, products):
    olma, _ = products
    bad = client_for(operator).put(f'/api/operator/orders/{order.id}/items/',
                                   {'items': [{'city_product': olma.id, 'qty': '0.300'}]}, format='json')
    assert bad.status_code == 400
    empty = client_for(operator).put(f'/api/operator/orders/{order.id}/items/', {'items': []}, format='json')
    assert empty.status_code == 400


@pytest.mark.django_db
def test_stage_move_logs_the_transition(operator, order, city):
    res = client_for(operator).post(f'/api/operator/orders/{order.id}/stage/', {'stage': 'accepted'}, format='json')
    assert res.status_code == 200 and res.json()['stage'] == 'accepted'
    event = order.events.get(kind=OrderEvent.Kind.STAGE)
    assert event.from_stage.code == 'new' and event.to_stage.code == 'accepted' and event.actor_id == operator.id


@pytest.mark.django_db
def test_cancel_needs_a_reason_and_then_freezes_the_order(operator, order):
    without = client_for(operator).post(f'/api/operator/orders/{order.id}/stage/',
                                        {'stage': 'canceled'}, format='json')
    assert without.status_code == 400
    ok = client_for(operator).post(f'/api/operator/orders/{order.id}/stage/',
                                   {'stage': 'canceled', 'note': 'Mijoz rad etdi'}, format='json')
    assert ok.status_code == 200
    blocked = client_for(operator).patch(f'/api/operator/orders/{order.id}/',
                                         {'comment': 'kech'}, format='json')
    assert blocked.status_code == 400


@pytest.mark.django_db
def test_call_and_print_events_are_recorded(operator, order):
    res = client_for(operator).post(f'/api/operator/orders/{order.id}/events/', {'kind': 'called'}, format='json')
    assert res.status_code == 201
    assert order.events.filter(kind=OrderEvent.Kind.CALLED).count() == 1
    bad = client_for(operator).post(f'/api/operator/orders/{order.id}/events/', {'kind': 'stage'}, format='json')
    assert bad.status_code == 400
