from datetime import datetime, time, timedelta
import pytest
from django.utils import timezone
from rest_framework.test import APIClient
from apps.cities.models import City
from apps.catalog.models import Category, Product, CityProduct
from apps.orders.models import DeliverySlot, Order
from apps.orders.slots import build_days, slot_is_open


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
