import pytest
from django.urls import reverse


@pytest.mark.django_db
def test_cities_url_is_registered():
    # The /api/cities/ route must resolve once Task 1 mounts the api urls.
    url = reverse('cities:list')
    assert url == '/api/cities/'
