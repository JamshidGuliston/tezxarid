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
