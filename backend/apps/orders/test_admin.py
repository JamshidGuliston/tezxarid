from datetime import time
import pytest
from django.contrib.admin.sites import AdminSite
from django.contrib.auth import get_user_model
from django.test import RequestFactory
from apps.cities.models import City
from apps.orders.admin import DeliverySlotAdmin, OrderAdmin
from apps.orders.models import DeliverySlot, Order

User = get_user_model()


@pytest.fixture
def cities(db):
    return (City.objects.create(name='Toshkent', slug='toshkent'),
            City.objects.create(name='Samarqand', slug='samarqand'))


def request_as(user):
    request = RequestFactory().get('/admin/')
    request.user = user
    return request


@pytest.mark.django_db
def test_city_admin_sees_only_own_slots(cities):
    tashkent, samarkand = cities
    mine = DeliverySlot.objects.create(city=tashkent, start_time=time(9, 0), end_time=time(12, 0))
    DeliverySlot.objects.create(city=samarkand, start_time=time(9, 0), end_time=time(12, 0))
    admin_user = User.objects.create_user(username='tk', password='x', is_staff=True,
                                          role=User.Role.CITY_ADMIN, city=tashkent)
    model_admin = DeliverySlotAdmin(DeliverySlot, AdminSite())
    assert list(model_admin.get_queryset(request_as(admin_user))) == [mine]


@pytest.mark.django_db
def test_city_admin_city_choices_limited_to_own_city(cities):
    tashkent, _ = cities
    admin_user = User.objects.create_user(username='tk', password='x', is_staff=True,
                                          role=User.Role.CITY_ADMIN, city=tashkent)
    model_admin = DeliverySlotAdmin(DeliverySlot, AdminSite())
    field = model_admin.formfield_for_foreignkey(
        DeliverySlot._meta.get_field('city'), request_as(admin_user))
    assert list(field.queryset) == [tashkent]


@pytest.mark.django_db
def test_superadmin_city_choices_unrestricted(cities):
    boss = User.objects.create_superuser(username='boss', password='x')
    model_admin = DeliverySlotAdmin(DeliverySlot, AdminSite())
    field = model_admin.formfield_for_foreignkey(
        DeliverySlot._meta.get_field('city'), request_as(boss))
    assert field.queryset.count() == 2


@pytest.mark.django_db
def test_order_admin_delivery_window_column(cities):
    tashkent, _ = cities
    order = Order.objects.create(city=tashkent, customer_name='A', phone='+998901112233', total=0,
                                 delivery_start=time(16, 0), delivery_end=time(19, 0))
    model_admin = OrderAdmin(Order, AdminSite())
    assert model_admin.delivery_window(order) == '16:00–19:00'
    assert 'delivery_window' in model_admin.list_display
    assert model_admin.delivery_window(Order(city=tashkent)) == '—'
