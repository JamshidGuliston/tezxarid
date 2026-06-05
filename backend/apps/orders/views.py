from rest_framework import status
from rest_framework.response import Response
from apps.common.city import CityScopedAPIView
from .models import Order
from .serializers import OrderCreateSerializer, OrderSerializer


class OrderListCreateView(CityScopedAPIView):
    """POST creates a guest/authed order (needs X-City-Id); GET lists the caller's own orders (needs JWT)."""

    def post(self, request):
        serializer = OrderCreateSerializer(
            data=request.data, context={'request': request, 'city': self.city})
        serializer.is_valid(raise_exception=True)
        order = serializer.save()
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)

    def get(self, request):
        if not request.user.is_authenticated:
            return Response({'detail': 'Authentication required.'},
                            status=status.HTTP_401_UNAUTHORIZED)
        orders = (Order.objects.filter(user=request.user)
                  .prefetch_related('items', 'items__city_product__product'))
        return Response(OrderSerializer(orders, many=True).data)
