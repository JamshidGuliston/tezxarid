from django.db.models.signals import post_save
from django.dispatch import receiver
from apps.cities.models import City
from .models import OrderStage
from .stages import seed_stages


@receiver(post_save, sender=City)
def seed_city_stages(sender, instance, created, **kwargs):
    """A city is useless to an operator without a pipeline: give every new city the default one."""
    if created:
        seed_stages(instance.pk, OrderStage)
