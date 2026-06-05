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


@pytest.mark.django_db
def test_city_admin_sees_only_own_city_users():
    tashkent = City.objects.create(name='Toshkent', slug='toshkent')
    samarkand = City.objects.create(name='Samarqand', slug='samarqand')
    User.objects.create_user(username='mine', password='x', city=tashkent)
    User.objects.create_user(username='theirs', password='x', city=samarkand)
    admin_user = User.objects.create_user(
        username='cadmin', password='x', is_staff=True,
        role=User.Role.CITY_ADMIN, city=tashkent)

    ma = UserAdmin(User, AdminSite())
    request = RequestFactory().get('/admin/')
    request.user = admin_user

    usernames = set(ma.get_queryset(request).values_list('username', flat=True))
    # sees own-city users (including self), not the Samarkand user
    assert 'mine' in usernames
    assert 'cadmin' in usernames
    assert 'theirs' not in usernames


@pytest.mark.django_db
def test_city_admin_without_city_sees_no_users():
    User.objects.create_user(username='someone', password='x')
    rogue = User.objects.create_user(
        username='rogue', password='x', is_staff=True,
        role=User.Role.CITY_ADMIN, city=None)

    ma = UserAdmin(User, AdminSite())
    request = RequestFactory().get('/admin/')
    request.user = rogue

    assert ma.get_queryset(request).count() == 0
