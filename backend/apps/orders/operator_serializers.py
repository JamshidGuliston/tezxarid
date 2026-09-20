from decimal import Decimal
from django.core.validators import MaxValueValidator, MinValueValidator
from rest_framework import serializers
from apps.catalog.models import CityProduct
from apps.common.validators import PHONE_VALIDATOR
from .models import DeliverySlot, Order, OrderEvent, OrderItem, OrderStage


class OperatorStageSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderStage
        fields = ['id', 'code', 'name', 'sort_order', 'is_initial', 'is_final', 'is_canceled']
        read_only_fields = list(fields)


class OperatorOrderItemSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='city_product.product.name', read_only=True)
    unit = serializers.CharField(source='city_product.product.unit', read_only=True)
    step = serializers.DecimalField(source='city_product.product.step', max_digits=6, decimal_places=3, read_only=True)
    line_total = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = ['id', 'city_product', 'name', 'unit', 'step', 'qty', 'price_snapshot', 'line_total']
        read_only_fields = list(fields)

    def get_line_total(self, obj) -> str:
        return f'{obj.qty * obj.price_snapshot:.2f}'


class OperatorEventSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source='actor.username', read_only=True, default='')
    from_stage_name = serializers.CharField(source='from_stage.name', read_only=True, default='')
    to_stage_name = serializers.CharField(source='to_stage.name', read_only=True, default='')

    class Meta:
        model = OrderEvent
        fields = ['id', 'kind', 'actor_name', 'from_stage_name', 'to_stage_name', 'note', 'created_at']
        read_only_fields = list(fields)


def _window(obj):
    if not obj.delivery_start or not obj.delivery_end:
        return ''
    return f'{obj.delivery_start:%H:%M} – {obj.delivery_end:%H:%M}'


class OperatorOrderListSerializer(serializers.ModelSerializer):
    stage = serializers.CharField(source='stage.code', read_only=True, default='')
    stage_name = serializers.CharField(source='stage.name', read_only=True, default='')
    delivery_window = serializers.SerializerMethodField()
    items_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Order
        fields = ['id', 'customer_name', 'phone', 'address', 'total', 'stage', 'stage_name',
                  'delivery_date', 'delivery_window', 'items_count', 'created_at', 'user']
        read_only_fields = list(fields)

    def get_delivery_window(self, obj) -> str:
        return _window(obj)


class OperatorOrderSerializer(serializers.ModelSerializer):
    stage = serializers.CharField(source='stage.code', read_only=True, default='')
    stage_name = serializers.CharField(source='stage.name', read_only=True, default='')
    stage_id = serializers.IntegerField(read_only=True)
    is_terminal = serializers.SerializerMethodField()
    delivery_window = serializers.SerializerMethodField()
    items = OperatorOrderItemSerializer(many=True, read_only=True)
    events = OperatorEventSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = ['id', 'city', 'user', 'customer_name', 'phone', 'address', 'latitude', 'longitude',
                  'comment', 'payment_type', 'total', 'stage', 'stage_id', 'stage_name', 'is_terminal',
                  'delivery_date', 'delivery_start', 'delivery_end', 'delivery_window', 'delivery_slot',
                  'created_at', 'updated_at', 'items', 'events']
        read_only_fields = list(fields)

    def get_is_terminal(self, obj) -> bool:
        return bool(obj.stage and (obj.stage.is_final or obj.stage.is_canceled))

    def get_delivery_window(self, obj) -> str:
        return _window(obj)


MAX_ORDER_ITEMS = 100
LAT_VALIDATORS = [MinValueValidator(Decimal('-90')), MaxValueValidator(Decimal('90'))]
LNG_VALIDATORS = [MinValueValidator(Decimal('-180')), MaxValueValidator(Decimal('180'))]


class OperatorOrderPatchSerializer(serializers.ModelSerializer):
    """Fields an operator may change while on the phone with the customer."""
    phone = serializers.CharField(max_length=20, required=False, validators=[PHONE_VALIDATOR])
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True,
                                        validators=LAT_VALIDATORS)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True,
                                         validators=LNG_VALIDATORS)
    delivery_slot_id = serializers.IntegerField(required=False, allow_null=True, min_value=1)

    class Meta:
        model = Order
        fields = ['customer_name', 'phone', 'address', 'latitude', 'longitude', 'comment',
                  'payment_type', 'delivery_date', 'delivery_slot_id']

    def validate_delivery_slot_id(self, value):
        if value is None:
            return value
        city = self.context['city']
        if not DeliverySlot.objects.filter(pk=value, city=city, is_active=True).exists():
            raise serializers.ValidationError('Delivery slot not available in this city.')
        return value

    def update(self, instance, validated_data):
        # The operator agreed the window by phone, so lead time is not enforced here.
        slot_id = validated_data.pop('delivery_slot_id', 'absent')
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if slot_id != 'absent':
            instance.delivery_slot_id = slot_id
            slot = DeliverySlot.objects.filter(pk=slot_id).first() if slot_id else None
            instance.delivery_start = slot.start_time if slot else None
            instance.delivery_end = slot.end_time if slot else None
        instance.save()
        return instance


class OperatorItemInputSerializer(serializers.Serializer):
    city_product = serializers.PrimaryKeyRelatedField(
        queryset=CityProduct.objects.select_related('product'))
    qty = serializers.DecimalField(max_digits=8, decimal_places=3, min_value=Decimal('0.001'))


class OperatorItemsSerializer(serializers.Serializer):
    """Full replacement of an order's lines."""
    items = OperatorItemInputSerializer(many=True, max_length=MAX_ORDER_ITEMS)

    def validate_items(self, items):
        if not items:
            raise serializers.ValidationError('At least one item is required.')
        city = self.context['city']
        for item in items:
            cp = item['city_product']
            if cp.city_id != city.id:
                raise serializers.ValidationError('All items must belong to the order city.')
            step = cp.product.step or Decimal('1')
            if (item['qty'] % step) != 0:
                raise serializers.ValidationError(f'{cp.product.name}: quantity must be a multiple of {step}.')
        return items


class StageMoveSerializer(serializers.Serializer):
    stage = serializers.CharField(max_length=32)
    note = serializers.CharField(max_length=500, required=False, allow_blank=True, default='')


class EventCreateSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=[OrderEvent.Kind.CALLED, OrderEvent.Kind.PRINTED])
    note = serializers.CharField(max_length=500, required=False, allow_blank=True, default='')
