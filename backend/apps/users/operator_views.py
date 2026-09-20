from decimal import Decimal
from django.db.models import Count, DecimalField, Max, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from rest_framework.response import Response
from apps.common.city import OperatorAPIView
from apps.orders.models import Order
from apps.orders.operator_serializers import OperatorOrderSerializer
from .address_serializers import AddressSerializer
from .models import Address, User

DEFAULT_PAGE = 50
MAX_PAGE = 200
MONEY = DecimalField(max_digits=12, decimal_places=2)


def _customer_queryset(city):
    """Users who ordered in this city, plus customers whose profile city is this city."""
    return (User.objects
            .filter(Q(orders__city=city) | Q(city=city, role=User.Role.CUSTOMER))
            .distinct()
            .annotate(
                orders_count=Count('orders', filter=Q(orders__city=city), distinct=True),
                orders_total=Coalesce(Sum('orders__total', filter=Q(orders__city=city)), Value(0), output_field=MONEY),
                last_order_at=Max('orders__created_at', filter=Q(orders__city=city))))


def _row(user):
    name = f'{user.first_name} {user.last_name}'.strip() or user.username
    return {'id': user.id, 'name': name, 'username': user.username, 'phone': user.phone,
            'telegram_id': user.telegram_id, 'date_joined': user.date_joined,
            'orders_count': user.orders_count,
            'orders_total': str(Decimal(user.orders_total).quantize(Decimal('0.01'))),
            'last_order_at': user.last_order_at}


class CustomerListView(OperatorAPIView):
    """GET: the city's customers with their order counts and spend."""

    def get(self, request):
        qs = _customer_queryset(self.city)
        q = (request.query_params.get('q') or '').strip()
        if q:
            qs = qs.filter(Q(first_name__icontains=q) | Q(last_name__icontains=q)
                           | Q(phone__icontains=q) | Q(username__icontains=q))
        total = qs.count()
        try:
            limit = min(int(request.query_params.get('limit', DEFAULT_PAGE)), MAX_PAGE)
            offset = max(int(request.query_params.get('offset', 0)), 0)
        except (TypeError, ValueError):
            limit, offset = DEFAULT_PAGE, 0
        rows = qs.order_by('-last_order_at', '-date_joined')[offset:offset + max(limit, 1)]
        return Response({'count': total, 'results': [_row(u) for u in rows]})


class CustomerDetailView(OperatorAPIView):
    """GET: one customer with their saved addresses and every order placed in this city."""

    def get(self, request, pk):
        user = get_object_or_404(_customer_queryset(self.city), pk=pk)
        orders = (Order.objects.filter(city=self.city, user=user)
                  .select_related('stage', 'delivery_slot', 'user')
                  .prefetch_related('items__city_product__product', 'events__actor',
                                    'events__from_stage', 'events__to_stage'))
        addresses = Address.objects.filter(user=user, city=self.city)
        body = _row(user)
        body['addresses'] = AddressSerializer(addresses, many=True).data
        body['orders'] = OperatorOrderSerializer(orders, many=True).data
        return Response(body)
