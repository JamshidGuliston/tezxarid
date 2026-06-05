from rest_framework.generics import ListAPIView
from rest_framework.exceptions import ValidationError
from apps.common.city import resolve_city
from .models import Category, CityProduct
from .serializers import CategorySerializer, CityProductSerializer


class CategoryListView(ListAPIView):
    serializer_class = CategorySerializer
    pagination_class = None

    def get_queryset(self):
        return Category.objects.filter(is_active=True)


class ProductListView(ListAPIView):
    serializer_class = CityProductSerializer
    pagination_class = None

    def get_queryset(self):
        city = resolve_city(self.request)
        qs = (CityProduct.objects
              .filter(city=city, is_available=True, product__is_active=True)
              .select_related('product', 'product__category')
              .order_by('product__name'))
        category = self.request.query_params.get('category')
        if category:
            try:
                qs = qs.filter(product__category_id=int(category))
            except (TypeError, ValueError):
                raise ValidationError({'category': 'category must be an integer.'})
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(product__name__icontains=search)
        return qs
