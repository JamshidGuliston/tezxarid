from django.contrib import admin
from apps.users.models import User
from .models import Category, Product, CityProduct


class CityScopedAdmin(admin.ModelAdmin):
    """Restrict city_admin users to their own city. Override `city_field`."""
    city_field = 'city'

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
