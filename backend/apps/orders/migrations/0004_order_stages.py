import django.db.models.deletion
from django.db import migrations, models
from apps.orders.stages import seed_stages


def forward(apps, schema_editor):
    City = apps.get_model('cities', 'City')
    OrderStage = apps.get_model('orders', 'OrderStage')
    Order = apps.get_model('orders', 'Order')
    for city_id in City.objects.values_list('pk', flat=True):
        seed_stages(city_id, OrderStage)
    by_city = {}
    for stage in OrderStage.objects.all():
        by_city.setdefault(stage.city_id, {})[stage.code] = stage.pk
    for order in Order.objects.all().only('pk', 'city_id', 'status'):
        codes = by_city.get(order.city_id, {})
        stage_id = codes.get(order.status) or codes.get('new')
        if stage_id:
            Order.objects.filter(pk=order.pk).update(stage_id=stage_id)


def backward(apps, schema_editor):
    Order = apps.get_model('orders', 'Order')
    for order in Order.objects.select_related('stage').only('pk', 'stage__code'):
        if order.stage_id:
            Order.objects.filter(pk=order.pk).update(status=order.stage.code)


class Migration(migrations.Migration):
    dependencies = [
        ('cities', '0001_initial'),
        ('orders', '0003_delivery_slots'),
    ]

    operations = [
        migrations.CreateModel(
            name='OrderStage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(max_length=32)),
                ('name', models.CharField(max_length=50)),
                ('sort_order', models.PositiveIntegerField(default=0)),
                ('is_initial', models.BooleanField(default=False, help_text='Where a new order starts (one per city).')),
                ('is_final', models.BooleanField(default=False, help_text='Successful terminal stage.')),
                ('is_canceled', models.BooleanField(default=False, help_text='Cancelled terminal stage.')),
                ('is_active', models.BooleanField(default=True)),
                ('city', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='stages', to='cities.city')),
            ],
            options={'ordering': ['city_id', 'sort_order']},
        ),
        migrations.AddConstraint(
            model_name='orderstage',
            constraint=models.UniqueConstraint(fields=('city', 'code'), name='uniq_city_stage_code'),
        ),
        migrations.AddField(
            model_name='order',
            name='stage',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT,
                                    related_name='orders', to='orders.orderstage'),
        ),
        migrations.RunPython(forward, backward),
        migrations.RemoveField(model_name='order', name='status'),
    ]
