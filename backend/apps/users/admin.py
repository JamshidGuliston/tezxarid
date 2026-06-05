from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Tezxarid', {'fields': ('role', 'telegram_id', 'phone', 'city')}),
    )
    list_display = ['username', 'role', 'city', 'phone', 'is_staff']
    list_filter = ['role', 'city', 'is_staff']
