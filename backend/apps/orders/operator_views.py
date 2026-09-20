from django.db.models import Count, Q
from rest_framework.response import Response
from apps.common.city import OperatorAPIView
from .models import Order, OrderStage
from .operator_serializers import (OperatorOrderListSerializer, OperatorOrderSerializer,
                                   OperatorStageSerializer)

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
        date = request.query_params.get('date')
        if date:
            qs = qs.filter(delivery_date=date)
        q = (request.query_params.get('q') or '').strip()
        if q:
            match = Q(customer_name__icontains=q) | Q(phone__icontains=q) | Q(address__icontains=q)
            if q.isdigit():
                match |= Q(pk=int(q))
            qs = qs.filter(match)
        total = qs.count()
        limit, offset = _page(request)
        rows = qs.order_by('-created_at')[offset:offset + limit]
        return Response({'count': total, 'counts': counts,
                         'results': OperatorOrderListSerializer(rows, many=True).data})


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
