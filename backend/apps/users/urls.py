from django.urls import path
from .views import TelegramAuthView

app_name = 'users'

urlpatterns = [
    path('telegram/', TelegramAuthView.as_view(), name='telegram-auth'),
]
