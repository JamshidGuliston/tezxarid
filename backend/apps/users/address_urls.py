from django.urls import path
from .address_views import AddressListCreateView, AddressDetailView

app_name = 'addresses'

urlpatterns = [
    path('', AddressListCreateView.as_view(), name='list-create'),
    path('<int:pk>/', AddressDetailView.as_view(), name='detail'),
]
