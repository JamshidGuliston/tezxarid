from rest_framework.exceptions import ValidationError
from rest_framework.views import APIView
from apps.cities.models import City

CITY_HEADER = 'X-City-Id'


def resolve_city(request):
    """Return the active City named by the X-City-Id header, or raise ValidationError."""
    raw = request.META.get('HTTP_X_CITY_ID')
    if not raw:
        raise ValidationError({'city': f'{CITY_HEADER} header is required.'})
    try:
        city_id = int(raw)
    except (TypeError, ValueError):
        raise ValidationError({'city': f'{CITY_HEADER} must be an integer.'})
    try:
        return City.objects.get(pk=city_id, is_active=True)
    except City.DoesNotExist:
        raise ValidationError({'city': 'Unknown or inactive city.'})


class CityScopedAPIView(APIView):
    """Base view exposing self.city resolved from the X-City-Id header."""

    @property
    def city(self):
        if not hasattr(self, '_city'):
            self._city = resolve_city(self.request)
        return self._city
