from datetime import time
import pytest
from django.contrib.admin.sites import AdminSite
from django.contrib.auth import get_user_model
from django.test import RequestFactory
from apps.cities.models import City
from apps.catalog.models import Category, Product, CityProduct
from apps.orders.admin import DeliverySlotAdmin, OrderAdmin, OrderItemInline
from apps.orders.models import DeliverySlot, Order, OrderItem

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


@pytest.mark.django_db
def test_non_global_staff_city_choices_fail_closed(cities):
    clerk = User.objects.create_user(username='clerk', password='x', is_staff=True,
                                     role=User.Role.CUSTOMER, city=None)
    model_admin = DeliverySlotAdmin(DeliverySlot, AdminSite())
    field = model_admin.formfield_for_foreignkey(DeliverySlot._meta.get_field('city'), request_as(clerk))
    assert field.queryset.count() == 0


@pytest.mark.django_db
def test_city_admin_form_rejects_foreign_city(cities):
    tashkent, samarkand = cities
    admin_user = User.objects.create_user(username='tk', password='x', is_staff=True,
                                          role=User.Role.CITY_ADMIN, city=tashkent)
    model_admin = DeliverySlotAdmin(DeliverySlot, AdminSite())
    Form = model_admin.get_form(request_as(admin_user))
    form = Form(data={'city': samarkand.pk, 'start_time': '09:00', 'end_time': '12:00',
                      'lead_minutes': 120, 'is_active': True})
    assert not form.is_valid()
    assert 'city' in form.errors


@pytest.mark.django_db
def test_order_admin_scopes_delivery_slot_and_syncs_snapshot(cities):
    tashkent, samarkand = cities
    mine = DeliverySlot.objects.create(city=tashkent, start_time=time(16, 0), end_time=time(19, 0))
    DeliverySlot.objects.create(city=samarkand, start_time=time(16, 0), end_time=time(19, 0))
    admin_user = User.objects.create_user(username='tk', password='x', is_staff=True,
                                          role=User.Role.CITY_ADMIN, city=tashkent)
    model_admin = OrderAdmin(Order, AdminSite())
    request = request_as(admin_user)
    field = model_admin.formfield_for_foreignkey(Order._meta.get_field('delivery_slot'), request)
    assert list(field.queryset) == [mine]

    order = Order(city=tashkent, customer_name='A', phone='+998901112233', total=0, delivery_slot=mine)
    model_admin.save_model(request, order, form=None, change=False)
    order.refresh_from_db()
    assert (order.delivery_start, order.delivery_end) == (time(16, 0), time(19, 0))


@pytest.mark.django_db
def test_order_item_inline_scopes_city_product(cities):
    tashkent, samarkand = cities
    cat = Category.objects.create(name='Mevalar')
    olma = Product.objects.create(name='Olma', category=cat)
    cp_tk = CityProduct.objects.create(city=tashkent, product=olma, price=19300)
    CityProduct.objects.create(city=samarkand, product=olma, price=20000)
    admin_user = User.objects.create_user(username='tk', password='x', is_staff=True,
                                          role=User.Role.CITY_ADMIN, city=tashkent)
    inline = OrderItemInline(Order, AdminSite())
    field = inline.formfield_for_foreignkey(OrderItem._meta.get_field('city_product'), request_as(admin_user))
    assert list(field.queryset) == [cp_tk]
