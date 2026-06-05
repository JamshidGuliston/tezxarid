from django.contrib import admin
from .models import Category, Product, CityProduct


class CityScopedAdmin(admin.ModelAdmin):
    """Restrict city_admin users to their own city. Override `city_field`."""
    city_field = 'city'

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        user = request.user
        if user.is_superuser or getattr(user, 'role', None) == 'superadmin':
            return qs
        if getattr(user, 'role', None) == 'city_admin' and user.city_id:
            return qs.filter(**{self.city_field: user.city_id})
        return qs


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
