from django.urls import path
from .views import OrderListCreateView

app_name = 'orders'

urlpatterns = [
    path('orders/', OrderListCreateView.as_view(), name='list-create'),
]
