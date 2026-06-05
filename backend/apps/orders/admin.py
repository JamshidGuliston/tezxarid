from django.contrib import admin
from apps.catalog.admin import CityScopedAdmin
from .models import Order, OrderItem


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ('price_snapshot',)


@admin.register(Order)
class OrderAdmin(CityScopedAdmin):
    city_field = 'city'
    list_display = ['id', 'city', 'customer_name', 'phone', 'status', 'payment_type', 'total', 'created_at']
    list_filter = ['city', 'status', 'payment_type']
    search_fields = ['customer_name', 'phone']
    inlines = [OrderItemInline]
