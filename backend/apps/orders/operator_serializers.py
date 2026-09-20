from rest_framework import serializers
from .models import Order, OrderEvent, OrderItem, OrderStage


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
