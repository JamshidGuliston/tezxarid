from rest_framework.generics import ListAPIView
from .models import City
from .serializers import CitySerializer


class CityListView(ListAPIView):
    serializer_class = CitySerializer
    pagination_class = None

    def get_queryset(self):
        return City.objects.filter(is_active=True)
