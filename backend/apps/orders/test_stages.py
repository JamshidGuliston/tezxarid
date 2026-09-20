import pytest
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient
from apps.cities.models import City
from apps.catalog.models import Category, CityProduct, Product
from apps.orders.models import DeliverySlot, Order, OrderStage
from apps.orders.stages import DEFAULT_STAGES


@pytest.fixture
def city(db):
    return City.objects.create(name='Guliston', slug='guliston')


@pytest.mark.django_db
def test_new_city_is_seeded_with_the_default_stages(city):
    codes = list(OrderStage.objects.filter(city=city).order_by('sort_order').values_list('code', flat=True))
    assert codes == [s['code'] for s in DEFAULT_STAGES]
    assert OrderStage.objects.get(city=city, code='new').is_initial is True
    assert OrderStage.objects.get(city=city, code='done').is_final is True
    assert OrderStage.objects.get(city=city, code='canceled').is_canceled is True


@pytest.mark.django_db
def test_initial_for_falls_back_to_the_lowest_sort_order(city):
    OrderStage.objects.filter(city=city, code='new').update(is_initial=False)
    assert OrderStage.initial_for(city).code == 'new'


@pytest.mark.django_db
def test_a_second_initial_stage_is_rejected(city):
    extra = OrderStage(city=city, code='extra', name='Qo\'shimcha', sort_order=15, is_initial=True)
    with pytest.raises(ValidationError):
        extra.full_clean()


@pytest.mark.django_db
def test_stage_codes_are_unique_per_city_but_shared_across_cities(city):
    other = City.objects.create(name='Toshkent', slug='toshkent')
    assert OrderStage.objects.filter(code='new').count() == 2
    with pytest.raises(Exception):
        OrderStage.objects.create(city=other, code='new', name='Takror', sort_order=99)


@pytest.mark.django_db
def test_created_order_starts_in_the_initial_stage_and_reports_progress(city):
    category = Category.objects.create(name='Mevalar')
    product = Product.objects.create(name='Olma', unit='kg', category=category)
    cp = CityProduct.objects.create(city=city, product=product, price='19300.00')
    slot = DeliverySlot.objects.create(city=city, start_time='09:00', end_time='23:00', lead_minutes=0)
    client = APIClient()
    tomorrow = __import__('datetime').date.today() + __import__('datetime').timedelta(days=1)
    payload = {
        'customer_name': 'Aziz', 'phone': '+998901234567', 'address': 'Chilonzor 5',
        # tomorrow, not today: slot_is_open() gates "today" on wall-clock vs. slot start, which
        # would make this test flaky depending on what time of day it runs (see test_api.py's
        # own delivery() helper, which sidesteps the same issue the same way).
        'delivery_date': str(tomorrow),
        'delivery_slot_id': slot.id,
        'items': [{'city_product': cp.id, 'qty': '1.000'}],
    }
    body = client.post('/api/orders/', payload, format='json', HTTP_X_CITY_ID=str(city.id)).json()
    assert body['status'] == 'new'
    assert body['status_label'] == 'Yangi'
    assert body['status_step'] == 1
    assert body['status_total'] == 5          # six stages minus the canceled one
    assert body['is_final'] is False and body['is_canceled'] is False
    assert Order.objects.get(pk=body['id']).stage.code == 'new'


@pytest.mark.django_db
def test_canceled_order_reports_zero_step(city):
    order = Order.objects.create(city=city, customer_name='A', phone='+998901234567', total='0')
    order.stage = OrderStage.objects.get(city=city, code='canceled')
    order.save(update_fields=['stage'])
    from apps.orders.serializers import OrderSerializer
    data = OrderSerializer(order).data
    assert data['status'] == 'canceled' and data['status_step'] == 0 and data['is_canceled'] is True
