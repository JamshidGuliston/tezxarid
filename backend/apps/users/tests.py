import pytest
from django.contrib.auth import get_user_model

User = get_user_model()


@pytest.mark.django_db
def test_user_defaults_to_customer_role():
    user = User.objects.create_user(username='aziz', password='x')
    assert user.role == User.Role.CUSTOMER
    assert user.city is None


@pytest.mark.django_db
def test_user_can_be_city_admin_with_city():
    from apps.cities.models import City
    city = City.objects.create(name='Toshkent', slug='toshkent')
    admin = User.objects.create_user(
        username='admin1', password='x', role=User.Role.CITY_ADMIN, city=city,
    )
    assert admin.role == User.Role.CITY_ADMIN
    assert admin.city == city
