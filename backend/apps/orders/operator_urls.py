from django.urls import path
from .operator_views import (OperatorProductView, OrderDetailView, OrderEventView, OrderItemsView, OrderListView,
                             OrderStageView, StageListView)

app_name = 'operator-orders'

urlpatterns = [
    path('stages/', StageListView.as_view(), name='stages'),
    path('orders/', OrderListView.as_view(), name='orders'),
    path('orders/<int:pk>/', OrderDetailView.as_view(), name='order-detail'),
    path('orders/<int:pk>/items/', OrderItemsView.as_view(), name='order-items'),
    path('orders/<int:pk>/stage/', OrderStageView.as_view(), name='order-stage'),
    path('orders/<int:pk>/events/', OrderEventView.as_view(), name='order-events'),
    path('products/', OperatorProductView.as_view(), name='products'),
]
