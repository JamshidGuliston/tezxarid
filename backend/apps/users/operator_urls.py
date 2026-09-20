from django.urls import path
from .operator_views import CustomerDetailView, CustomerListView

app_name = 'operator-customers'

urlpatterns = [
    path('', CustomerListView.as_view(), name='list'),
    path('<int:pk>/', CustomerDetailView.as_view(), name='detail'),
]
