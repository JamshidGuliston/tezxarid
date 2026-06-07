from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models


class Category(models.Model):
    name = models.CharField(max_length=100)
    image = models.ImageField(upload_to='categories/', blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name_plural = 'categories'
        ordering = ['sort_order', 'name']

    def __str__(self):
        return self.name


class Product(models.Model):
    class Unit(models.TextChoices):
        KG = 'kg', 'кг'
        PIECE = 'sht', 'дона'
        LITER = 'l', 'литр'
        GRAM = 'g', 'грамм'
        BUNCH = 'boglam', 'боғлам'

    name = models.CharField(max_length=150)
    image = models.ImageField(upload_to='products/', blank=True)
    unit = models.CharField(max_length=8, choices=Unit.choices, default=Unit.KG)
    step = models.DecimalField(
        max_digits=6, decimal_places=3, default=Decimal('1'),
        validators=[MinValueValidator(Decimal('0.001'))])
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='products')
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class CityProduct(models.Model):
    city = models.ForeignKey('cities.City', on_delete=models.CASCADE, related_name='city_products')
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='city_products')
    price = models.DecimalField(max_digits=12, decimal_places=2)
    is_available = models.BooleanField(default=True)
    stock = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['city', 'product'], name='uniq_city_product'),
        ]

    def __str__(self):
        return f'{self.product.name} @ {self.city.name}'
