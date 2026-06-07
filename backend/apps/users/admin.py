from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, Address

PRIVILEGE_FIELDS = ('role', 'is_superuser', 'is_staff', 'user_permissions', 'groups')


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Tezxarid', {'fields': ('role', 'telegram_id', 'phone', 'city')}),
    )
    list_display = ['username', 'role', 'city', 'phone', 'is_staff']
    list_filter = ['role', 'city', 'is_staff']

    def _is_super(self, user):
        return user.is_superuser or getattr(user, 'role', None) == User.Role.SUPERADMIN

    def get_readonly_fields(self, request, obj=None):
        readonly = super().get_readonly_fields(request, obj)
        if not self._is_super(request.user):
            readonly = tuple(readonly) + PRIVILEGE_FIELDS
        return readonly

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if self._is_super(request.user):
            return qs
        if getattr(request.user, 'role', None) == User.Role.CITY_ADMIN and request.user.city_id:
            return qs.filter(city_id=request.user.city_id)
        return qs.none()


@admin.register(Address)
class AddressAdmin(admin.ModelAdmin):
    list_display = ['title', 'user', 'city', 'address', 'is_default']
    list_filter = ['city', 'is_default']
    search_fields = ['address', 'user__username']

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        user = request.user
        if user.is_superuser or getattr(user, 'role', None) == User.Role.SUPERADMIN:
            return qs
        if getattr(user, 'role', None) == User.Role.CITY_ADMIN and user.city_id:
            return qs.filter(city_id=user.city_id)
        return qs.none()
