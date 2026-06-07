from django.db import models


class Order(models.Model):
    class Status(models.TextChoices):
        NEW = 'new', 'New'
        ACCEPTED = 'accepted', 'Accepted'
        DELIVERING = 'delivering', 'Delivering'
        DONE = 'done', 'Done'
        CANCELED = 'canceled', 'Canceled'

    class PaymentType(models.TextChoices):
        CASH = 'cash', 'Cash'
        ONLINE = 'online', 'Online'

    city = models.ForeignKey('cities.City', on_delete=models.PROTECT, related_name='orders')
    user = models.ForeignKey('users.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='orders')
    address_ref = models.ForeignKey(
        'users.Address', null=True, blank=True, on_delete=models.SET_NULL, related_name='orders')
    customer_name = models.CharField(max_length=120)
    phone = models.CharField(max_length=20)
    address = models.CharField(max_length=500, default='')
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    comment = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW)
    payment_type = models.CharField(max_length=10, choices=PaymentType.choices, default=PaymentType.CASH)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Order #{self.pk} ({self.city_id})'


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    city_product = models.ForeignKey('catalog.CityProduct', on_delete=models.PROTECT, related_name='order_items')
    qty = models.DecimalField(max_digits=8, decimal_places=3, default=1)
    price_snapshot = models.DecimalField(max_digits=12, decimal_places=2)

    def __str__(self):
        return f'{self.city_product} x{self.qty}'
