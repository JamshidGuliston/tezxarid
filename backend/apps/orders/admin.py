from django.contrib import admin
from apps.catalog.admin import CityScopedAdmin, is_global_admin
from apps.catalog.models import CityProduct
from apps.users.models import Address
from .models import DeliverySlot, Order, OrderEvent, OrderItem, OrderStage


def _scoped_city_id(request):
    return getattr(request.user, 'city_id', None)


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

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        # Inlines do not inherit CityScopedAdmin: scope product choices to the admin's city.
        if db_field.name == 'city_product' and not is_global_admin(request.user):
            kwargs['queryset'] = CityProduct.objects.filter(city_id=_scoped_city_id(request))
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


class OrderEventInline(admin.TabularInline):
    model = OrderEvent
    extra = 0
    can_delete = False
    readonly_fields = ['kind', 'actor', 'from_stage', 'to_stage', 'note', 'created_at']

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(OrderStage)
class OrderStageAdmin(CityScopedAdmin):
    city_field = 'city'
    list_display = ['city', 'sort_order', 'name', 'code', 'is_initial', 'is_final', 'is_canceled', 'is_active']
    list_editable = ['sort_order', 'name', 'is_active']
    list_filter = ['city', 'is_active']


@admin.register(Order)
class OrderAdmin(CityScopedAdmin):
    city_field = 'city'
    list_display = ['id', 'city', 'customer_name', 'phone', 'stage', 'payment_type',
                    'total', 'delivery_date', 'delivery_window', 'address', 'created_at']
    list_filter = ['city', 'stage', 'payment_type', 'delivery_date']
    search_fields = ['customer_name', 'phone', 'address']
    readonly_fields = ['created_at', 'updated_at', 'latitude', 'longitude',
                       'delivery_start', 'delivery_end']
    inlines = [OrderItemInline, OrderEventInline]

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        # `city` is handled by CityScopedAdmin; the slot and saved-address FKs are city-bound too.
        if not is_global_admin(request.user):
            if db_field.name == 'delivery_slot':
                kwargs['queryset'] = DeliverySlot.objects.filter(city_id=_scoped_city_id(request))
            elif db_field.name == 'address_ref':
                kwargs['queryset'] = Address.objects.filter(city_id=_scoped_city_id(request))
            elif db_field.name == 'stage':
                kwargs['queryset'] = OrderStage.objects.filter(city_id=_scoped_city_id(request))
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    def save_model(self, request, obj, form, change):
        # Keep the window snapshot in step with the chosen slot (the API does the same in create()).
        if obj.delivery_slot_id:
            obj.delivery_start = obj.delivery_slot.start_time
            obj.delivery_end = obj.delivery_slot.end_time
        super().save_model(request, obj, form, change)

    @admin.display(description='Delivery window', ordering='delivery_start')
    def delivery_window(self, obj):
        if not obj.delivery_start or not obj.delivery_end:
            return '—'
        return f'{obj.delivery_start:%H:%M}–{obj.delivery_end:%H:%M}'
