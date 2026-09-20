from django.urls import path
from .views import MeView, TelegramAuthView

app_name = 'users'

urlpatterns = [
    path('telegram/', TelegramAuthView.as_view(), name='telegram-auth'),
    path('me/', MeView.as_view(), name='me'),
]
