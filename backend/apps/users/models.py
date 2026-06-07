from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        CUSTOMER = 'customer', 'Customer'
        CITY_ADMIN = 'city_admin', 'City admin'
        SUPERADMIN = 'superadmin', 'Superadmin'

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.CUSTOMER)
    telegram_id = models.BigIntegerField(null=True, blank=True, unique=True)
    phone = models.CharField(max_length=20, blank=True)
    city = models.ForeignKey(
        'cities.City', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='users',
    )

    def __str__(self):
        return self.username


class Address(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='addresses')
    city = models.ForeignKey('cities.City', on_delete=models.PROTECT, related_name='addresses')
    title = models.CharField(max_length=50, blank=True)
    address = models.CharField(max_length=500)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-is_default', '-created_at']

    def __str__(self):
        label = self.title or 'Manzil'
        return f'{label} — {self.address}'
