import pytest
from decimal import Decimal
from django.contrib.auth import get_user_model
from apps.cities.models import City
from apps.users.models import Address

User = get_user_model()


@pytest.mark.django_db
def test_address_belongs_to_user_and_city():
    city = City.objects.create(name='Toshkent', slug='toshkent')
    user = User.objects.create_user(username='aziz', password='x', telegram_id=10)
    addr = Address.objects.create(
        user=user, city=city, title='Uy', address='Chilonzor 5-uy',
        latitude=Decimal('41.311081'), longitude=Decimal('69.240562'), is_default=True)
    assert addr in user.addresses.all()
    assert str(addr) == 'Uy — Chilonzor 5-uy'
    assert addr.is_default is True
