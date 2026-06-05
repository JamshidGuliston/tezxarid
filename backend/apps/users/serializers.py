from rest_framework import serializers


class TelegramAuthSerializer(serializers.Serializer):
    init_data = serializers.CharField()
