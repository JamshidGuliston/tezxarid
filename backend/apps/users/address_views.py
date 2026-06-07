from django.db import transaction
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from .models import Address
from .address_serializers import AddressSerializer


def _clear_other_defaults(user, keep_pk=None):
    qs = Address.objects.filter(user=user, is_default=True)
    if keep_pk is not None:
        qs = qs.exclude(pk=keep_pk)
    qs.update(is_default=False)


class AddressListCreateView(generics.ListCreateAPIView):
    serializer_class = AddressSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return Address.objects.filter(user=self.request.user)

    @transaction.atomic
    def perform_create(self, serializer):
        instance = serializer.save(user=self.request.user)
        if instance.is_default:
            _clear_other_defaults(self.request.user, keep_pk=instance.pk)


class AddressDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = AddressSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Address.objects.filter(user=self.request.user)

    @transaction.atomic
    def perform_update(self, serializer):
        instance = serializer.save()
        if instance.is_default:
            _clear_other_defaults(self.request.user, keep_pk=instance.pk)
