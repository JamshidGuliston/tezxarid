import pytest
from apps.cities.models import City


@pytest.mark.django_db
def test_city_str_and_defaults():
    city = City.objects.create(name='Samarqand', slug='samarqand')
    assert str(city) == 'Samarqand'
    assert city.is_active is True
