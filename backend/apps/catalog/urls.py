from django.urls import path
from .views import CategoryListView, ProductListView

app_name = 'catalog'

urlpatterns = [
    path('categories/', CategoryListView.as_view(), name='category-list'),
    path('products/', ProductListView.as_view(), name='product-list'),
]
