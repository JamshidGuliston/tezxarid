from django.contrib.auth import get_user_model
from rest_framework import serializers
from apps.cities.models import City
from apps.common.validators import PHONE_VALIDATOR

User = get_user_model()


class TelegramAuthSerializer(serializers.Serializer):
    init_data = serializers.CharField()


class MeSerializer(serializers.ModelSerializer):
    """The signed-in customer's own profile (GET/PATCH /api/auth/me/)."""
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True, validators=[PHONE_VALIDATOR])
    city = serializers.PrimaryKeyRelatedField(
        queryset=City.objects.filter(is_active=True), required=False, allow_null=True)

    class Meta:
        model = User
        fields = ['id', 'telegram_id', 'first_name', 'last_name', 'phone', 'city', 'date_joined']
        read_only_fields = ['id', 'telegram_id', 'date_joined']

    def validate(self, attrs):
        # `User.city` is also the admin scope for role=city_admin staff (apps/catalog/admin.py
        # CityScopedAdmin): the public profile must never re-point it. Dropped silently so the
        # customer-side city switch (which already applied locally) does not error for staff.
        if self.instance is not None and self.instance.is_staff:
            attrs.pop('city', None)
        return attrs
