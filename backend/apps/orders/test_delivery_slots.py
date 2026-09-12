from datetime import date, datetime, time, timedelta
from datetime import timezone as dt_timezone
import pytest
from django.utils import timezone
from rest_framework.test import APIClient
from apps.cities.models import City
from apps.catalog.models import Category, Product, CityProduct
from apps.orders.models import DeliverySlot, Order
from apps.orders.slots import build_days, date_in_horizon, slot_is_open


@pytest.fixture
def city(db):
    return City.objects.create(name='Toshkent', slug='toshkent')


@pytest.fixture
def slots(city):
    morning = DeliverySlot.objects.create(city=city, start_time=time(9, 0), end_time=time(12, 0))
    evening = DeliverySlot.objects.create(city=city, start_time=time(16, 0), end_time=time(19, 0))
    return morning, evening


def at(hour, minute=0, day=12):
    """Aware local datetime on 2026-09-<day>."""
    return timezone.make_aware(datetime(2026, 9, day, hour, minute))


@pytest.mark.django_db
def test_slot_is_open_rules(slots):
    morning, _ = slots  # 09:00–12:00, lead 120
    today = at(6, 0).date()
    assert slot_is_open(morning, today, at(6, 0)) is True      # 06:00 + 2h = 08:00 <= 09:00
    assert slot_is_open(morning, today, at(7, 0)) is True      # exactly 09:00 is still open
    assert slot_is_open(morning, today, at(7, 1)) is False     # 09:01 > 09:00
    assert slot_is_open(morning, today + timedelta(days=1), at(23, 0)) is True
    assert slot_is_open(morning, today - timedelta(days=1), at(1, 0)) is False


@pytest.mark.django_db
def test_build_days_returns_seven_days_with_availability(city, slots):
    days = build_days(city, now=at(8, 0))
    assert len(days) == 7
    assert days[0]['date'] == '2026-09-12'
    assert days[6]['date'] == '2026-09-18'
    today_slots = days[0]['slots']
    assert [s['start'] for s in today_slots] == ['09:00', '16:00']
    assert [s['end'] for s in today_slots] == ['12:00', '19:00']
    assert [s['available'] for s in today_slots] == [False, True]   # 08:00+2h > 09:00; <= 16:00
    assert all(s['available'] for s in days[1]['slots'])


@pytest.mark.django_db
def test_build_days_skips_inactive_and_other_cities(city, slots):
    morning, _ = slots
    morning.is_active = False
    morning.save(update_fields=['is_active'])
    other = City.objects.create(name='Samarqand', slug='samarqand')
    DeliverySlot.objects.create(city=other, start_time=time(10, 0), end_time=time(13, 0))
    days = build_days(city, now=at(8, 0))
    assert [s['start'] for s in days[0]['slots']] == ['16:00']


@pytest.mark.django_db
def test_build_days_defaults_to_local_now(city, slots, monkeypatch):
    monkeypatch.setattr('apps.orders.slots.local_now', lambda: at(8, 0))
    days = build_days(city)  # no now= → production path via local_now()
    assert days[0]['date'] == '2026-09-12'
    assert [s['available'] for s in days[0]['slots']] == [False, True]


@pytest.mark.django_db
def test_build_days_city_without_slots_returns_seven_empty_days(city):
    days = build_days(city, now=at(8, 0))
    assert len(days) == 7
    assert all(d['slots'] == [] for d in days)


def test_date_in_horizon_bounds():
    today = date(2026, 9, 12)
    assert date_in_horizon(today, today) is True
    assert date_in_horizon(date(2026, 9, 18), today) is True    # today + 6 = last offered day
    assert date_in_horizon(date(2026, 9, 19), today) is False
    assert date_in_horizon(date(2026, 9, 11), today) is False


@pytest.mark.django_db
def test_slot_is_open_normalizes_utc_now_to_local(city):
    # 2026-09-12 03:00 local (+05:00) == 2026-09-11 22:00 UTC. A 04:00 slot with lead 120
    # is already closed for the 12th; a UTC-aware `now` must not turn it into "future date → open".
    slot = DeliverySlot.objects.create(city=city, start_time=time(4, 0), end_time=time(7, 0))
    utc_now = at(3, 0).astimezone(dt_timezone.utc)
    assert slot_is_open(slot, at(3, 0).date(), utc_now) is False


@pytest.mark.django_db
def test_delivery_slots_api_requires_city_header(slots):
    resp = APIClient().get('/api/delivery-slots/')
    assert resp.status_code == 400


@pytest.mark.django_db
def test_delivery_slots_api_returns_days_for_city(city, slots, monkeypatch):
    monkeypatch.setattr('apps.orders.slots.local_now', lambda: at(8, 0))
    resp = APIClient().get('/api/delivery-slots/', HTTP_X_CITY_ID=str(city.id))
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 7
    assert body[0]['date'] == '2026-09-12'
    assert set(body[0]['slots'][0].keys()) == {'id', 'start', 'end', 'available'}
    assert body[0]['slots'][0]['available'] is False
    assert body[0]['slots'][1]['available'] is True


@pytest.fixture
def shop(city):
    cat = Category.objects.create(name='Mevalar')
    olma = Product.objects.create(name='Olma', unit=Product.Unit.KG, category=cat)
    return CityProduct.objects.create(city=city, product=olma, price=19300)


def order_payload(cp, **over):
    base = {
        'customer_name': 'Aziz', 'phone': '+998901112233', 'address': 'Chilonzor 5',
        'items': [{'city_product': cp.id, 'qty': 1}],
    }
    base.update(over)
    return base


def post_order(city, payload):
    return APIClient().post('/api/orders/', payload, format='json', HTTP_X_CITY_ID=str(city.id))


@pytest.mark.django_db
def test_create_order_with_slot_snapshots_window(city, slots, shop, monkeypatch):
    _, evening = slots
    monkeypatch.setattr('apps.orders.slots.local_now', lambda: at(8, 0))
    resp = post_order(city, order_payload(shop, delivery_date='2026-09-12', delivery_slot_id=evening.id))
    assert resp.status_code == 201, resp.json()
    body = resp.json()
    assert body['delivery_date'] == '2026-09-12'
    assert body['delivery_start'] == '16:00'
    assert body['delivery_end'] == '19:00'
    order = Order.objects.get(pk=body['id'])
    assert order.delivery_slot_id == evening.id
    assert order.delivery_start == time(16, 0)


@pytest.mark.django_db
def test_create_order_requires_delivery_fields(city, slots, shop):
    resp = post_order(city, order_payload(shop))
    assert resp.status_code == 400
    assert {'delivery_date', 'delivery_slot_id'} <= set(resp.json().keys())


@pytest.mark.django_db
def test_create_order_rejects_slot_closed_for_today(city, slots, shop, monkeypatch):
    morning, _ = slots
    monkeypatch.setattr('apps.orders.slots.local_now', lambda: at(8, 0))  # 08:00+2h > 09:00
    resp = post_order(city, order_payload(shop, delivery_date='2026-09-12', delivery_slot_id=morning.id))
    assert resp.status_code == 400
    assert resp.json()['delivery_slot_id'] == ['Delivery slot closed for today.']
    assert Order.objects.count() == 0


@pytest.mark.django_db
def test_create_order_rejects_date_out_of_range(city, slots, shop, monkeypatch):
    _, evening = slots
    monkeypatch.setattr('apps.orders.slots.local_now', lambda: at(8, 0))
    for bad in ('2026-09-11', '2026-09-19'):   # yesterday, today + 7
        resp = post_order(city, order_payload(shop, delivery_date=bad, delivery_slot_id=evening.id))
        assert resp.status_code == 400, bad
        assert 'delivery_date' in resp.json()
    assert Order.objects.count() == 0


@pytest.mark.django_db
def test_create_order_accepts_the_last_offered_day(city, slots, shop, monkeypatch):
    _, evening = slots
    monkeypatch.setattr('apps.orders.slots.local_now', lambda: at(8, 0))
    # 2026-09-18 == today + DELIVERY_DAYS_AHEAD - 1 == the last day GET /api/delivery-slots/ returns
    resp = post_order(city, order_payload(shop, delivery_date='2026-09-18', delivery_slot_id=evening.id))
    assert resp.status_code == 201, resp.json()


@pytest.mark.django_db
def test_create_order_rejects_inactive_or_foreign_slot(city, slots, shop, monkeypatch):
    morning, _ = slots
    monkeypatch.setattr('apps.orders.slots.local_now', lambda: at(8, 0))
    morning.is_active = False
    morning.save(update_fields=['is_active'])
    resp = post_order(city, order_payload(shop, delivery_date='2026-09-13', delivery_slot_id=morning.id))
    assert resp.status_code == 400 and resp.json()['delivery_slot_id'] == ['Delivery slot not available.']

    other = City.objects.create(name='Samarqand', slug='samarqand')
    foreign = DeliverySlot.objects.create(city=other, start_time=time(10, 0), end_time=time(13, 0))
    resp = post_order(city, order_payload(shop, delivery_date='2026-09-13', delivery_slot_id=foreign.id))
    assert resp.status_code == 400 and resp.json()['delivery_slot_id'] == ['Delivery slot not available.']
    assert Order.objects.count() == 0


@pytest.mark.django_db
@pytest.mark.parametrize('phone', ['+998 90 111 22 33', '12345678', '90 123'])
def test_create_order_rejects_bad_phone(city, slots, shop, monkeypatch, phone):
    _, evening = slots
    monkeypatch.setattr('apps.orders.slots.local_now', lambda: at(8, 0))
    resp = post_order(city, order_payload(shop, phone=phone, delivery_date='2026-09-13',
                                          delivery_slot_id=evening.id))
    assert resp.status_code == 400, phone
    assert 'phone' in resp.json()


@pytest.mark.django_db
def test_create_order_accepts_phone_without_plus(city, slots, shop, monkeypatch):
    _, evening = slots
    monkeypatch.setattr('apps.orders.slots.local_now', lambda: at(8, 0))
    resp = post_order(city, order_payload(shop, phone='998901112233', delivery_date='2026-09-13',
                                          delivery_slot_id=evening.id))
    assert resp.status_code == 201, resp.json()
