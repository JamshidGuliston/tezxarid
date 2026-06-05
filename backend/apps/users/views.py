from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import TelegramAuthSerializer
from .telegram import TelegramAuthError, verify_telegram_init_data

User = get_user_model()


class TelegramAuthView(APIView):
    """Exchange verified Telegram initData for a JWT pair (creating the user if new)."""

    def post(self, request):
        serializer = TelegramAuthSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tg_user = verify_telegram_init_data(
                serializer.validated_data['init_data'],
                settings.TELEGRAM_BOT_TOKEN,
            )
        except TelegramAuthError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        telegram_id = tg_user['id']
        user, _ = User.objects.get_or_create(
            telegram_id=telegram_id,
            defaults={'username': f'tg_{telegram_id}'},
        )
        user.first_name = tg_user.get('first_name', '')
        user.last_name = tg_user.get('last_name', '')
        user.save(update_fields=['first_name', 'last_name'])

        refresh = RefreshToken.for_user(user)
        return Response({'access': str(refresh.access_token), 'refresh': str(refresh)})
