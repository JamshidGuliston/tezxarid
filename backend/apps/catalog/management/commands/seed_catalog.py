"""Seed a starter grocery catalog: categories, products, per-city prices and delivery slots.

Idempotent: re-running adds anything missing and never overwrites prices, availability or
slot settings an admin has already changed. Cities are NOT created — every active city in
the database gets prices and slots.

    python manage.py seed_catalog
"""
from datetime import time
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.catalog.models import Category, CityProduct, Product
from apps.cities.models import City
from apps.orders.models import DeliverySlot

KG, PCS, L, G, BUNCH = 'kg', 'sht', 'l', 'g', 'boglam'

# (category, sort_order, [(product, unit, step, base price in so'm)])
CATALOG = [
    ('Mevalar', 1, [
        ('Olma', KG, '0.5', 18000),
        ('Banan', KG, '0.5', 26000),
        ('Uzum', KG, '0.5', 22000),
        ('Anor', KG, '0.5', 25000),
        ('Nok', KG, '0.5', 20000),
        ('Limon', KG, '0.5', 24000),
        ('Mandarin', KG, '0.5', 28000),
        ('Shaftoli', KG, '0.5', 21000),
    ]),
    ('Sabzavotlar', 2, [
        ('Kartoshka', KG, '1', 6000),
        ('Piyoz', KG, '1', 4500),
        ('Sabzi', KG, '0.5', 6500),
        ('Pomidor', KG, '0.5', 12000),
        ('Bodring', KG, '0.5', 10000),
        ('Bulg\'or qalampiri', KG, '0.5', 16000),
        ('Baqlajon', KG, '0.5', 9000),
        ('Karam', KG, '0.5', 5000),
        ('Sarimsoq', KG, '0.5', 30000),
    ]),
    ('Ko\'katlar', 3, [
        ('Ukrop', BUNCH, '1', 2000),
        ('Kashnich', BUNCH, '1', 2000),
        ('Ko\'k piyoz', BUNCH, '1', 2500),
        ('Rayhon', BUNCH, '1', 2500),
        ('Salat bargi', BUNCH, '1', 4000),
    ]),
    ('Quruq meva va yong\'oqlar', 4, [
        ('Mayiz', KG, '0.5', 45000),
        ('Yong\'oq mag\'zi', KG, '0.5', 120000),
        ('Bodom', KG, '0.5', 140000),
        ('Quritilgan o\'rik', KG, '0.5', 60000),
    ]),
    ('Go\'sht mahsulotlari', 5, [
        ('Mol go\'shti', KG, '0.5', 115000),
        ('Qo\'y go\'shti', KG, '0.5', 125000),
        ('Tovuq go\'shti', KG, '0.5', 42000),
        ('Tovuq filesi', KG, '0.5', 55000),
        ('Qiyma (mol)', KG, '0.5', 105000),
    ]),
    ('Sut mahsulotlari', 6, [
        ('Sut 1 l', PCS, '1', 14000),
        ('Kefir 1 l', PCS, '1', 15000),
        ('Qatiq 500 g', PCS, '1', 9000),
        ('Tvorog', KG, '0.5', 48000),
        ('Smetana 400 g', PCS, '1', 18000),
        ('Sariyog\' 200 g', PCS, '1', 25000),
        ('Pishloq', KG, '0.5', 95000),
        ('Tuxum (10 dona)', PCS, '1', 16000),
    ]),
    ('Non mahsulotlari', 7, [
        ('Obi non', PCS, '1', 4000),
        ('Patir', PCS, '1', 6000),
        ('Buxanka non', PCS, '1', 5000),
        ('Lavash', PCS, '1', 5000),
    ]),
    ('Don va yormalar', 8, [
        ('Guruch (lazer)', KG, '1', 20000),
        ('Un (oliy nav)', KG, '1', 8000),
        ('Grechka', KG, '1', 24000),
        ('Makaron 400 g', PCS, '1', 9000),
        ('Shakar', KG, '1', 13000),
        ('Tuz 1 kg', PCS, '1', 3000),
        ('Kungaboqar yog\'i 1 l', PCS, '1', 21000),
    ]),
    ('Ichimliklar', 9, [
        ('Suv 1.5 l', PCS, '1', 5000),
        ('Suv 5 l', PCS, '1', 12000),
        ('Ko\'k choy 100 g', PCS, '1', 15000),
        ('Qora choy 100 g', PCS, '1', 15000),
    ]),
]

# Delivery windows created for every active city (lead_minutes uses the model default, 120).
SLOTS = [(time(9, 0), time(12, 0)), (time(12, 0), time(15, 0)),
         (time(16, 0), time(19, 0)), (time(19, 0), time(22, 0))]


class Command(BaseCommand):
    help = 'Seed starter categories, products, per-city prices and delivery slots (idempotent).'

    @transaction.atomic
    def handle(self, *args, **options):
        cities = list(City.objects.filter(is_active=True))
        if not cities:
            self.stderr.write('No active cities — create a city in the admin first.')
            return

        created = {'categories': 0, 'products': 0, 'city_products': 0, 'slots': 0}
        products = []
        for cat_name, order, items in CATALOG:
            category, was_created = Category.objects.get_or_create(
                name=cat_name, defaults={'sort_order': order})
            created['categories'] += was_created
            for name, unit, step, price in items:
                product, was_created = Product.objects.get_or_create(
                    name=name, defaults={'category': category, 'unit': unit, 'step': Decimal(step)})
                created['products'] += was_created
                products.append((product, Decimal(price)))

        for city in cities:
            for product, price in products:
                _, was_created = CityProduct.objects.get_or_create(
                    city=city, product=product, defaults={'price': price, 'is_available': True, 'stock': 100})
                created['city_products'] += was_created
            for start, end in SLOTS:
                _, was_created = DeliverySlot.objects.get_or_create(
                    city=city, start_time=start, end_time=end)
                created['slots'] += was_created

        self.stdout.write(self.style.SUCCESS(
            f"Cities: {', '.join(c.name for c in cities)} | new categories {created['categories']}, "
            f"products {created['products']}, city products {created['city_products']}, "
            f"delivery slots {created['slots']} | totals: {Category.objects.count()} categories, "
            f"{Product.objects.count()} products, {CityProduct.objects.count()} city products, "
            f"{DeliverySlot.objects.count()} slots"))
