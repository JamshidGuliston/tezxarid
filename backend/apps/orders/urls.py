from django.urls import path
from .views import DeliverySlotListView, OrderListCreateView

app_name = 'orders'

urlpatterns = [
    path('orders/', OrderListCreateView.as_view(), name='list-create'),
    path('delivery-slots/', DeliverySlotListView.as_view(), name='delivery-slots'),
]
