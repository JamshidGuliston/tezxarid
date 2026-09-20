from decimal import Decimal
from django.db import transaction
from django.db.models import Count, Q
from rest_framework import status
from rest_framework.response import Response
from apps.common.city import OperatorAPIView
from .models import Order, OrderEvent, OrderItem, OrderStage
from .operator_serializers import (EventCreateSerializer, OperatorEventSerializer, OperatorItemsSerializer,
                                   OperatorOrderListSerializer, OperatorOrderPatchSerializer,
                                   OperatorOrderSerializer, OperatorStageSerializer, StageMoveSerializer)

MAX_PAGE = 200
DEFAULT_PAGE = 50


def _page(request):
    try:
        limit = min(int(request.query_params.get('limit', DEFAULT_PAGE)), MAX_PAGE)
        offset = max(int(request.query_params.get('offset', 0)), 0)
    except (TypeError, ValueError):
        limit, offset = DEFAULT_PAGE, 0
    return max(limit, 1), offset


class StageListView(OperatorAPIView):
    """GET: the operator city's pipeline, in order."""

    def get(self, request):
        stages = OrderStage.objects.filter(city=self.city, is_active=True).order_by('sort_order')
        return Response(OperatorStageSerializer(stages, many=True).data)


class OrderListView(OperatorAPIView):
    """GET: the city's orders with per-stage counts, filtered by stage, delivery date and free text."""

    def get(self, request):
        base = Order.objects.filter(city=self.city)
        date = request.query_params.get('date')
        if date:
            base = base.filter(delivery_date=date)
        q = (request.query_params.get('q') or '').strip()
        if q:
            match = Q(customer_name__icontains=q) | Q(phone__icontains=q) | Q(address__icontains=q)
            if q.isdigit():
                match |= Q(pk=int(q))
            base = base.filter(match)

        counts = {code: 0 for code in
                  OrderStage.objects.filter(city=self.city, is_active=True)
                  .order_by('sort_order').values_list('code', flat=True)}
        for row in base.values('stage__code').annotate(n=Count('id')):
            if row['stage__code'] in counts:
                counts[row['stage__code']] = row['n']

        qs = base.select_related('stage').annotate(items_count=Count('items'))
        stage = request.query_params.get('stage')
        if stage:
            qs = qs.filter(stage__code=stage)
        total = qs.count()
        limit, offset = _page(request)
        rows = qs.order_by('-created_at')[offset:offset + limit]
        return Response({'count': total, 'counts': counts,
                         'results': OperatorOrderListSerializer(rows, many=True).data})


TERMINAL_MSG = 'This order is already closed.'


def _log(order, actor, kind, note='', from_stage=None, to_stage=None):
    OrderEvent.objects.create(order=order, actor=actor, kind=kind, note=note,
                              from_stage=from_stage, to_stage=to_stage)


def _recalculate(order):
    total = sum((i.qty * i.price_snapshot for i in order.items.all()), Decimal('0'))
    order.total = total
    order.save(update_fields=['total', 'updated_at'])
    return total


class OrderDetailView(OperatorAPIView):
    """GET: one order of the operator's city with items and the event log."""

    def get_object(self, pk):
        from django.shortcuts import get_object_or_404
        return get_object_or_404(
            Order.objects.filter(city=self.city)
            .select_related('stage', 'delivery_slot', 'user')
            .prefetch_related('items__city_product__product', 'events__actor',
                              'events__from_stage', 'events__to_stage'),
            pk=pk)

    def get(self, request, pk):
        return Response(OperatorOrderSerializer(self.get_object(pk)).data)

    def patch(self, request, pk):
        order = self.get_object(pk)
        if order.stage and (order.stage.is_final or order.stage.is_canceled):
            return Response({'detail': TERMINAL_MSG}, status=status.HTTP_400_BAD_REQUEST)
        serializer = OperatorOrderPatchSerializer(order, data=request.data, partial=True,
                                                  context={'city': self.city})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        _log(order, request.user, OrderEvent.Kind.EDITED,
             note=', '.join(sorted(serializer.validated_data)))
        return Response(OperatorOrderSerializer(self.get_object(pk)).data)


class OrderItemsView(OrderDetailView):
    """PUT: replace every line of the order and recalculate the total."""

    @transaction.atomic
    def put(self, request, pk):
        order = self.get_object(pk)
        if order.stage and (order.stage.is_final or order.stage.is_canceled):
            return Response({'detail': TERMINAL_MSG}, status=status.HTTP_400_BAD_REQUEST)
        serializer = OperatorItemsSerializer(data=request.data, context={'city': self.city})
        serializer.is_valid(raise_exception=True)
        kept = {i.city_product_id: i.price_snapshot for i in order.items.all()}
        order.items.all().delete()
        OrderItem.objects.bulk_create([
            OrderItem(order=order, city_product=row['city_product'], qty=row['qty'],
                      price_snapshot=kept.get(row['city_product'].id, row['city_product'].price))
            for row in serializer.validated_data['items']
        ])
        order.refresh_from_db()
        _recalculate(order)
        _log(order, request.user, OrderEvent.Kind.EDITED, note='items')
        return Response(OperatorOrderSerializer(self.get_object(pk)).data)


class OrderStageView(OrderDetailView):
    """POST: move the order to another stage of this city."""

    def post(self, request, pk):
        order = self.get_object(pk)
        serializer = StageMoveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if order.stage and (order.stage.is_final or order.stage.is_canceled):
            return Response({'detail': TERMINAL_MSG}, status=status.HTTP_400_BAD_REQUEST)
        target = OrderStage.objects.filter(city=self.city, is_active=True,
                                           code=serializer.validated_data['stage']).first()
        if target is None:
            return Response({'stage': 'Unknown stage for this city.'}, status=status.HTTP_400_BAD_REQUEST)
        note = serializer.validated_data['note'].strip()
        if target.is_canceled and not note:
            return Response({'note': 'A cancellation needs a reason.'}, status=status.HTTP_400_BAD_REQUEST)
        previous = order.stage
        order.stage = target
        order.save(update_fields=['stage', 'updated_at'])
        _log(order, request.user, OrderEvent.Kind.STAGE, note=note, from_stage=previous, to_stage=target)
        return Response(OperatorOrderSerializer(self.get_object(pk)).data)


class OrderEventView(OrderDetailView):
    """POST: record that the operator called the customer or printed the receipt."""

    def post(self, request, pk):
        order = self.get_object(pk)
        serializer = EventCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        event = OrderEvent.objects.create(order=order, actor=request.user,
                                          kind=serializer.validated_data['kind'],
                                          note=serializer.validated_data['note'])
        return Response(OperatorEventSerializer(event).data, status=status.HTTP_201_CREATED)
