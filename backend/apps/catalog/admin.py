from django.contrib import admin
from apps.cities.models import City
from apps.users.models import User
from .models import Category, Product, CityProduct


def is_global_admin(user):
    """Superusers and SUPERADMIN-role staff see and edit every city."""
    return user.is_superuser or getattr(user, 'role', None) == User.Role.SUPERADMIN


class CityScopedAdmin(admin.ModelAdmin):
    """Restrict city_admin users to their own city. Override `city_field`."""
    city_field = 'city'

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        user = request.user
        if is_global_admin(user):
            return qs
        if getattr(user, 'role', None) == User.Role.CITY_ADMIN and user.city_id:
            return qs.filter(**{self.city_field: user.city_id})
        return qs.none()  # city_admin without a city, or any other staff role, sees nothing (safe default)

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        # Anyone who is not a global admin may only create/edit rows for their own city
        # (a user without a city gets no choices at all). ModelChoiceField validates against
        # this queryset, so a foreign city id POSTed by hand is rejected too.
        if db_field.name == self.city_field and not is_global_admin(request.user):
            kwargs['queryset'] = City.objects.filter(pk=getattr(request.user, 'city_id', None))
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
