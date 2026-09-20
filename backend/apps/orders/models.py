from django.core.exceptions import ValidationError
from django.db import models


class DeliverySlot(models.Model):
    """A per-city delivery time window customers can pick at checkout."""
    city = models.ForeignKey('cities.City', on_delete=models.CASCADE, related_name='delivery_slots')
    start_time = models.TimeField()
    end_time = models.TimeField()
    lead_minutes = models.PositiveIntegerField(
        default=120, help_text='Minimum minutes between ordering and the slot start (same-day orders).')
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['city_id', 'start_time']
        constraints = [
            models.CheckConstraint(
                condition=models.Q(end_time__gt=models.F('start_time')),
                name='delivery_slot_end_after_start'),
            models.UniqueConstraint(
                fields=['city', 'start_time', 'end_time'], name='delivery_slot_unique_window'),
        ]

    def __str__(self):
        return f'{self.city} {self.start_time:%H:%M}–{self.end_time:%H:%M}'


class OrderStage(models.Model):
    """One step of a city's order pipeline. Cities configure their own set."""
    city = models.ForeignKey('cities.City', on_delete=models.CASCADE, related_name='stages')
    code = models.CharField(max_length=32)
    name = models.CharField(max_length=50)
    sort_order = models.PositiveIntegerField(default=0)
    is_initial = models.BooleanField(default=False, help_text='Where a new order starts (one per city).')
    is_final = models.BooleanField(default=False, help_text='Successful terminal stage.')
    is_canceled = models.BooleanField(default=False, help_text='Cancelled terminal stage.')
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['city_id', 'sort_order']
        constraints = [
            models.UniqueConstraint(fields=['city', 'code'], name='uniq_city_stage_code'),
        ]

    def __str__(self):
        return f'{self.city} · {self.name}'

    def clean(self):
        if self.is_final and self.is_canceled:
            raise ValidationError('A stage cannot be both final and cancelled.')
        if self.is_initial:
            clash = OrderStage.objects.filter(city=self.city, is_initial=True).exclude(pk=self.pk)
            if clash.exists():
                raise ValidationError({'is_initial': 'This city already has an initial stage.'})

    @property
    def is_terminal(self):
        return self.is_final or self.is_canceled

    @classmethod
    def initial_for(cls, city):
        """The city's starting stage: the flagged one, else the lowest sort_order."""
        stages = cls.objects.filter(city=city, is_active=True)
        return stages.filter(is_initial=True).first() or stages.order_by('sort_order').first()


class Order(models.Model):
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
    delivery_slot = models.ForeignKey(
        DeliverySlot, null=True, blank=True, on_delete=models.SET_NULL, related_name='orders')
    delivery_date = models.DateField(null=True, blank=True)
    delivery_start = models.TimeField(null=True, blank=True)   # snapshot of the slot
    delivery_end = models.TimeField(null=True, blank=True)     # snapshot of the slot
    stage = models.ForeignKey(OrderStage, null=True, blank=True, on_delete=models.PROTECT, related_name='orders')
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


class OrderEvent(models.Model):
    """Audit trail: who moved, edited, called or printed an order, and when."""
    class Kind(models.TextChoices):
        CREATED = 'created', 'Created'
        STAGE = 'stage', 'Stage changed'
        EDITED = 'edited', 'Edited'
        CALLED = 'called', 'Called'
        PRINTED = 'printed', 'Printed'

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='events')
    actor = models.ForeignKey('users.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    kind = models.CharField(max_length=16, choices=Kind.choices)
    from_stage = models.ForeignKey(OrderStage, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    to_stage = models.ForeignKey(OrderStage, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    note = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.get_kind_display()} · order {self.order_id}'
