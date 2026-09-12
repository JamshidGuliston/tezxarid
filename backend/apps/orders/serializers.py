from datetime import timedelta
from decimal import Decimal
from django.conf import settings
from django.core.validators import RegexValidator
from django.db import transaction
from rest_framework import serializers
from apps.catalog.models import CityProduct
from apps.users.models import Address
from .models import DeliverySlot, Order, OrderItem
from .slots import local_now, slot_is_open

PHONE_VALIDATOR = RegexValidator(r'^\+?\d{9,15}$', 'Enter a valid phone number.')


class OrderItemInputSerializer(serializers.Serializer):
    city_product = serializers.PrimaryKeyRelatedField(
        queryset=CityProduct.objects.filter(product__is_active=True).select_related('product'))
    qty = serializers.DecimalField(max_digits=8, decimal_places=3, min_value=Decimal('0.001'))


class OrderItemSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='city_product.product.name', read_only=True)
    unit = serializers.CharField(source='city_product.product.unit', read_only=True)

    class Meta:
        model = OrderItem
        fields = ['id', 'name', 'unit', 'qty', 'price_snapshot']


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    delivery_start = serializers.TimeField(format='%H:%M', read_only=True)
    delivery_end = serializers.TimeField(format='%H:%M', read_only=True)

    class Meta:
        model = Order
        fields = ['id', 'city', 'customer_name', 'phone', 'address', 'latitude',
                  'longitude', 'comment', 'status', 'payment_type', 'total',
                  'delivery_date', 'delivery_start', 'delivery_end',
                  'created_at', 'items']
        read_only_fields = list(fields)


class OrderCreateSerializer(serializers.Serializer):
    customer_name = serializers.CharField(max_length=120)
    phone = serializers.CharField(max_length=20, validators=[PHONE_VALIDATOR])
    payment_type = serializers.ChoiceField(
        choices=Order.PaymentType.choices, default=Order.PaymentType.CASH)
    comment = serializers.CharField(required=False, allow_blank=True, default='')
    address_id = serializers.IntegerField(required=False)
    address = serializers.CharField(max_length=500, required=False, allow_blank=True)
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    delivery_date = serializers.DateField()
    delivery_slot_id = serializers.IntegerField()
    items = OrderItemInputSerializer(many=True)

    def validate_items(self, items):
        if not items:
            raise serializers.ValidationError('At least one item is required.')
        city = self.context['city']
        for item in items:
            cp = item['city_product']
            if cp.city_id != city.id:
                raise serializers.ValidationError('All items must belong to the request city.')
            if not cp.is_available:
                raise serializers.ValidationError(f'{cp.product.name} is not available.')
            step = cp.product.step or Decimal('1')
            if (item['qty'] % step) != 0:
                raise serializers.ValidationError(
                    f'{cp.product.name}: quantity must be a multiple of {step}.')
        return items

    def validate(self, attrs):
        city = self.context['city']
        now = local_now()
        today = now.date()
        date = attrs['delivery_date']
        last = today + timedelta(days=settings.DELIVERY_DAYS_AHEAD - 1)
        if not (today <= date <= last):
            raise serializers.ValidationError({'delivery_date': 'Delivery date out of range.'})
        try:
            slot = DeliverySlot.objects.get(pk=attrs['delivery_slot_id'], city=city, is_active=True)
        except DeliverySlot.DoesNotExist:
            raise serializers.ValidationError({'delivery_slot_id': 'Delivery slot not available.'})
        if not slot_is_open(slot, date, now):
            raise serializers.ValidationError({'delivery_slot_id': 'Delivery slot closed for today.'})
        attrs['delivery_slot'] = slot
        return attrs

    def _resolve_address(self, validated):
        request = self.context['request']
        address_id = validated.get('address_id')
        if address_id:
            if not request.user.is_authenticated:
                raise serializers.ValidationError({'address_id': 'Authentication required to use a saved address.'})
            try:
                addr = Address.objects.get(pk=address_id, user=request.user)
            except Address.DoesNotExist:
                raise serializers.ValidationError({'address_id': 'Address not found.'})
            return addr.address, addr.latitude, addr.longitude, addr
        text = (validated.get('address') or '').strip()
        if not text:
            raise serializers.ValidationError({'address': 'An address (or address_id) is required.'})
        return text, validated.get('latitude'), validated.get('longitude'), None

    @transaction.atomic
    def create(self, validated_data):
        city = self.context['city']
        request = self.context['request']
        user = request.user if request.user.is_authenticated else None
        address_text, lat, lng, addr_obj = self._resolve_address(validated_data)
        items = validated_data['items']
        slot = validated_data['delivery_slot']
        total = sum(i['city_product'].price * i['qty'] for i in items)
        order = Order.objects.create(
            city=city, user=user, address_ref=addr_obj,
            customer_name=validated_data['customer_name'],
            phone=validated_data['phone'],
            address=address_text, latitude=lat, longitude=lng,
            comment=validated_data.get('comment', ''),
            payment_type=validated_data['payment_type'],
            delivery_slot=slot,
            delivery_date=validated_data['delivery_date'],
            delivery_start=slot.start_time,
            delivery_end=slot.end_time,
            total=total,
        )
        OrderItem.objects.bulk_create([
            OrderItem(order=order, city_product=i['city_product'],
                      qty=i['qty'], price_snapshot=i['city_product'].price)
            for i in items
        ])
        return order
