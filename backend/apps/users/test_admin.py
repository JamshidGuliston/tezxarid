import pytest
from django.contrib.admin.sites import AdminSite
from django.test import RequestFactory
from django.contrib.auth import get_user_model
from apps.cities.models import City
from apps.users.admin import UserAdmin

User = get_user_model()


@pytest.mark.django_db
def test_city_admin_cannot_edit_privilege_fields():
    city = City.objects.create(name='Toshkent', slug='toshkent')
    staff = User.objects.create_user(
        username='cadmin', password='x', is_staff=True,
        role=User.Role.CITY_ADMIN, city=city)
    ma = UserAdmin(User, AdminSite())
    request = RequestFactory().get('/admin/')
    request.user = staff

    readonly = ma.get_readonly_fields(request)
    assert 'role' in readonly
    assert 'is_superuser' in readonly
    assert 'is_staff' in readonly


@pytest.mark.django_db
def test_superadmin_can_edit_privilege_fields():
    boss = User.objects.create_superuser(username='boss', password='x')
    ma = UserAdmin(User, AdminSite())
    request = RequestFactory().get('/admin/')
    request.user = boss

    readonly = ma.get_readonly_fields(request)
    assert 'role' not in readonly
    assert 'is_superuser' not in readonly
