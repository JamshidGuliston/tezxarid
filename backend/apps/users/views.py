from uuid import uuid4

from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import MeSerializer, TelegramAuthSerializer
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
        existing = User.objects.filter(telegram_id=telegram_id).first()
        if existing is None:
            username = f'tg_{telegram_id}'
            while User.objects.filter(username=username).exists():
                username = f'tg_{telegram_id}_{uuid4().hex[:6]}'
            user, _ = User.objects.get_or_create(
                telegram_id=telegram_id, defaults={'username': username})
        else:
            user = existing
        user.first_name = tg_user.get('first_name', '')
        user.last_name = tg_user.get('last_name', '')
        user.save(update_fields=['first_name', 'last_name'])

        refresh = RefreshToken.for_user(user)
        return Response({'access': str(refresh.access_token), 'refresh': str(refresh)})


class MeView(APIView):
    """GET: the caller's profile. PATCH: partial update of name, phone, city."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(MeSerializer(request.user).data)

    def patch(self, request):
        serializer = MeSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


from django.contrib.auth import authenticate
from rest_framework.throttling import AnonRateThrottle
from apps.common.permissions import is_operator
from .serializers import MeSerializer, OperatorLoginSerializer, OperatorUserSerializer, TelegramAuthSerializer


class OperatorLoginThrottle(AnonRateThrottle):
    """The console is on the public frontend: slow down password guessing."""
    scope = 'operator_login'
    rate = '10/min'


class OperatorLoginView(APIView):
    """Username + password sign-in for the order admin console."""
    throttle_classes = [OperatorLoginThrottle]

    def post(self, request):
        serializer = OperatorLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(request,
                            username=serializer.validated_data['username'],
                            password=serializer.validated_data['password'])
        if user is None:
            return Response({'detail': "Login yoki parol noto'g'ri."}, status=status.HTTP_400_BAD_REQUEST)
        if not is_operator(user):
            return Response({'detail': 'Operator access required.'}, status=status.HTTP_403_FORBIDDEN)
        refresh = RefreshToken.for_user(user)
        return Response({'access': str(refresh.access_token), 'refresh': str(refresh),
                         'user': OperatorUserSerializer(user).data})
