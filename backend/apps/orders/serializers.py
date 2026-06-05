from django.db import transaction
from rest_framework import serializers
from apps.catalog.models import CityProduct
from .models import Order, OrderItem


class OrderItemInputSerializer(serializers.Serializer):
    city_product = serializers.PrimaryKeyRelatedField(
        queryset=CityProduct.objects.filter(product__is_active=True).select_related('product'))
    qty = serializers.IntegerField(min_value=1)


class OrderItemSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='city_product.product.name', read_only=True)

    class Meta:
        model = OrderItem
        fields = ['id', 'name', 'qty', 'price_snapshot']


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = ['id', 'city', 'customer_name', 'phone', 'status',
                  'payment_type', 'total', 'created_at', 'items']
        read_only_fields = list(fields)


class OrderCreateSerializer(serializers.Serializer):
    customer_name = serializers.CharField(max_length=120)
    phone = serializers.CharField(max_length=20)
    payment_type = serializers.ChoiceField(
        choices=Order.PaymentType.choices, default=Order.PaymentType.CASH)
    items = OrderItemInputSerializer(many=True)

    def validate_items(self, items):
        if not items:
            raise serializers.ValidationError('At least one item is required.')
        city = self.context['city']
        for item in items:
            if item['city_product'].city_id != city.id:
                raise serializers.ValidationError(
                    'All items must belong to the request city.')
            if not item['city_product'].is_available:
                raise serializers.ValidationError(
                    f"{item['city_product'].product.name} is not available.")
        return items

    @transaction.atomic
    def create(self, validated_data):
        city = self.context['city']
        user = self.context['request'].user
        items = validated_data['items']
        total = sum(i['city_product'].price * i['qty'] for i in items)
        order = Order.objects.create(
            city=city,
            user=user if user.is_authenticated else None,
            customer_name=validated_data['customer_name'],
            phone=validated_data['phone'],
            payment_type=validated_data['payment_type'],
            total=total,
        )
        OrderItem.objects.bulk_create([
            OrderItem(order=order, city_product=i['city_product'],
                      qty=i['qty'], price_snapshot=i['city_product'].price)
            for i in items
        ])
        return order
