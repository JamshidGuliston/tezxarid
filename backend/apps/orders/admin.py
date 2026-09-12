from django.contrib import admin
from apps.catalog.admin import CityScopedAdmin
from .models import DeliverySlot, Order, OrderItem


@admin.register(DeliverySlot)
class DeliverySlotAdmin(CityScopedAdmin):
    city_field = 'city'
    list_display = ['city', 'start_time', 'end_time', 'lead_minutes', 'is_active']
    list_filter = ['city', 'is_active']
    list_editable = ['is_active']


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ('price_snapshot',)


@admin.register(Order)
class OrderAdmin(CityScopedAdmin):
    city_field = 'city'
    list_display = ['id', 'city', 'customer_name', 'phone', 'status', 'payment_type',
                    'total', 'delivery_date', 'delivery_window', 'address', 'created_at']
    list_filter = ['city', 'status', 'payment_type', 'delivery_date']
    search_fields = ['customer_name', 'phone', 'address']
    readonly_fields = ['created_at', 'updated_at', 'latitude', 'longitude',
                       'delivery_start', 'delivery_end']
    inlines = [OrderItemInline]

    @admin.display(description='Delivery window')
    def delivery_window(self, obj):
        if not obj.delivery_start or not obj.delivery_end:
            return '—'
        return f'{obj.delivery_start:%H:%M}–{obj.delivery_end:%H:%M}'
