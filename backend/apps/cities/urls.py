from django.urls import path
from .views import CityListView

app_name = 'cities'

urlpatterns = [
    path('', CityListView.as_view(), name='list'),
]
