from django.urls import path
from .operator_views import OrderDetailView, OrderListView, StageListView

app_name = 'operator-orders'

urlpatterns = [
    path('stages/', StageListView.as_view(), name='stages'),
    path('orders/', OrderListView.as_view(), name='orders'),
    path('orders/<int:pk>/', OrderDetailView.as_view(), name='order-detail'),
]
