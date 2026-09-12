from django.contrib import admin
from apps.cities.models import City
from apps.users.models import User
from .models import Category, Product, CityProduct


class CityScopedAdmin(admin.ModelAdmin):
    """Restrict city_admin users to their own city. Override `city_field`."""
    city_field = 'city'

    def _is_city_admin(self, user):
        return not user.is_superuser and getattr(user, 'role', None) == User.Role.CITY_ADMIN

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        user = request.user
        role = getattr(user, 'role', None)
        if user.is_superuser or role == User.Role.SUPERADMIN:
            return qs
        if role == User.Role.CITY_ADMIN:
            if user.city_id:
                return qs.filter(**{self.city_field: user.city_id})
            return qs.none()  # city_admin with no city sees nothing (safe default)
        return qs.none()  # unknown/unprivileged staff role sees nothing (safe default)

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        # A city admin may only create/edit rows for their own city.
        if db_field.name == self.city_field and self._is_city_admin(request.user):
            kwargs['queryset'] = City.objects.filter(pk=request.user.city_id)
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'sort_order', 'is_active']
    list_editable = ['sort_order', 'is_active']


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ['name', 'category', 'unit', 'is_active']
    list_filter = ['category', 'unit', 'is_active']
    search_fields = ['name']


@admin.register(CityProduct)
class CityProductAdmin(CityScopedAdmin):
    city_field = 'city'
    list_display = ['product', 'city', 'price', 'is_available', 'stock']
    list_filter = ['city', 'is_available']
    search_fields = ['product__name']
