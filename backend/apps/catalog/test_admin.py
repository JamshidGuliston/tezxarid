import pytest
from django.contrib.admin.sites import AdminSite
from django.test import RequestFactory
from django.contrib.auth import get_user_model
from apps.cities.models import City
from apps.catalog.models import Category, Product, CityProduct
from apps.catalog.admin import CityProductAdmin

User = get_user_model()


@pytest.mark.django_db
def test_city_admin_sees_only_their_city():
    tashkent = City.objects.create(name='Toshkent', slug='toshkent')
    samarkand = City.objects.create(name='Samarqand', slug='samarqand')
    cat = Category.objects.create(name='Mevalar')
    product = Product.objects.create(name='Olma', category=cat)
    cp_tk = CityProduct.objects.create(city=tashkent, product=product, price=19300)
    CityProduct.objects.create(city=samarkand, product=product, price=20000)

    admin_user = User.objects.create_user(
        username='tk_admin', password='x', is_staff=True,
        role=User.Role.CITY_ADMIN, city=tashkent,
    )

    model_admin = CityProductAdmin(CityProduct, AdminSite())
    request = RequestFactory().get('/admin/')
    request.user = admin_user

    qs = model_admin.get_queryset(request)
    assert list(qs) == [cp_tk]


@pytest.mark.django_db
def test_superadmin_sees_all_cities():
    tashkent = City.objects.create(name='Toshkent', slug='toshkent')
    samarkand = City.objects.create(name='Samarqand', slug='samarqand')
    cat = Category.objects.create(name='Mevalar')
    product = Product.objects.create(name='Olma', category=cat)
    CityProduct.objects.create(city=tashkent, product=product, price=19300)
    CityProduct.objects.create(city=samarkand, product=product, price=20000)

    boss = User.objects.create_superuser(username='boss', password='x')

    model_admin = CityProductAdmin(CityProduct, AdminSite())
    request = RequestFactory().get('/admin/')
    request.user = boss

    assert model_admin.get_queryset(request).count() == 2
