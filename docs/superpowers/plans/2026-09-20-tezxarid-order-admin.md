# Order admin (operator console) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each city an operator console at `/order-admin` where a signed-in operator confirms, edits, stages, prints and tracks that city's orders, and browses its customers.

**Architecture:** The backend gains per-city `OrderStage` rows (replacing the fixed `Order.status` choices), an `OrderEvent` audit log, a password login for operator roles, and an `/api/operator/…` surface that is city-scoped by the operator's own city. The Angular app keeps one bundle: the router grows a second layout branch (`AdminShell`) beside the customer `Shell`, with its own token store and interceptor so a customer session and an operator session never mix.

**Tech Stack:** Django 6 + DRF + SimpleJWT + pytest; Angular 21.2 standalone/zoneless + Signals + Vitest.

**Spec:** `docs/superpowers/specs/2026-09-20-tezxarid-order-admin-design.md`

---

## File structure

**Backend**

| File | Responsibility |
| --- | --- |
| `apps/orders/stages.py` (modify) | `DEFAULT_STAGES`, `seed_stages()`, `stage_positions()` next to the existing slot helpers |
| `apps/orders/models.py` (modify) | `OrderStage`, `OrderEvent`, `Order.stage` |
| `apps/orders/signals.py` (new) | seed stages when a `City` is created |
| `apps/orders/migrations/0003_order_stages.py` (new) | model + data migration off `Order.status` |
| `apps/orders/serializers.py` (modify) | customer-facing stage fields; create sets the initial stage |
| `apps/orders/operator_serializers.py` (new) | list/detail/patch/items/stage/event serializers |
| `apps/orders/operator_views.py` (new) | stages, orders list/detail/patch/items/stage/events, products |
| `apps/orders/operator_urls.py` (new) | `/api/operator/…` routes |
| `apps/users/operator_views.py` (new) + `operator_urls.py` (new) | city customers list and detail |
| `apps/users/serializers.py` (modify) | `OperatorLoginSerializer`, `OperatorUserSerializer` |
| `apps/users/views.py` (modify) | `OperatorLoginView` |
| `apps/common/permissions.py` (new) | `is_operator()`, `IsOperator` |
| `apps/common/city.py` (modify) | `OperatorAPIView` |

**Frontend**

| File | Responsibility |
| --- | --- |
| `core/api/models/operator.models.ts` (new) | operator DTOs |
| `core/api/operator-api.ts` (new) | every `/api/operator/…` call plus the login call |
| `core/operator/operator.store.ts` (new) | operator tokens + profile, persisted under `tezxarid.operator` |
| `core/operator/operator.interceptor.ts` (new) | operator bearer, city header, shared 401 refresh |
| `core/operator/operator.guard.ts` (new) | redirect to the login page |
| `layout/admin-shell/admin-shell.ts` (new) | console header and router outlet |
| `features/order-admin/admin-login.ts` (new) | username/password form |
| `features/order-admin/orders-board.ts` (new) | stage tabs, filters, polling, beep |
| `features/order-admin/order-detail.ts` (new) | edit, stage moves, events, print trigger |
| `features/order-admin/order-items-editor.ts` (new) | item lines and product search |
| `features/order-admin/order-receipt.ts` (new) | 80 mm print block |
| `features/order-admin/customers.ts`, `customer-detail.ts` (new) | city customers |
| `shared/utils/beep.ts` (new) | short WebAudio alert |
| `app.ts`, `app.routes.ts`, `styles.scss`, `core/auth/auth.interceptor.ts`, `core/interceptors/city.interceptor.ts`, `shared/utils/order-status.ts`, `shared/ui/order-card/order-card.ts` (modify) | routing restructure, interceptor skips, customer-side stage label |

---

## Task 1: Backend — per-city `OrderStage`, `Order.stage`, customer-facing stage fields

**Files:**
- Create: `backend/apps/orders/signals.py`, `backend/apps/orders/migrations/0003_order_stages.py`, `backend/apps/orders/test_stages.py`
- Modify: `backend/apps/orders/models.py`, `backend/apps/orders/stages.py`, `backend/apps/orders/serializers.py`, `backend/apps/orders/admin.py`, `backend/apps/orders/apps.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/orders/test_stages.py`:
```python
import pytest
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient
from apps.cities.models import City
from apps.catalog.models import Category, CityProduct, Product
from apps.orders.models import DeliverySlot, Order, OrderStage
from apps.orders.stages import DEFAULT_STAGES


@pytest.fixture
def city(db):
    return City.objects.create(name='Guliston', slug='guliston')


@pytest.mark.django_db
def test_new_city_is_seeded_with_the_default_stages(city):
    codes = list(OrderStage.objects.filter(city=city).order_by('sort_order').values_list('code', flat=True))
    assert codes == [s['code'] for s in DEFAULT_STAGES]
    assert OrderStage.objects.get(city=city, code='new').is_initial is True
    assert OrderStage.objects.get(city=city, code='done').is_final is True
    assert OrderStage.objects.get(city=city, code='canceled').is_canceled is True


@pytest.mark.django_db
def test_initial_for_falls_back_to_the_lowest_sort_order(city):
    OrderStage.objects.filter(city=city, code='new').update(is_initial=False)
    assert OrderStage.initial_for(city).code == 'new'


@pytest.mark.django_db
def test_a_second_initial_stage_is_rejected(city):
    extra = OrderStage(city=city, code='extra', name='Qo\'shimcha', sort_order=15, is_initial=True)
    with pytest.raises(ValidationError):
        extra.full_clean()


@pytest.mark.django_db
def test_stage_codes_are_unique_per_city_but_shared_across_cities(city):
    other = City.objects.create(name='Toshkent', slug='toshkent')
    assert OrderStage.objects.filter(code='new').count() == 2
    with pytest.raises(Exception):
        OrderStage.objects.create(city=other, code='new', name='Takror', sort_order=99)


@pytest.mark.django_db
def test_created_order_starts_in_the_initial_stage_and_reports_progress(city):
    category = Category.objects.create(name='Mevalar')
    product = Product.objects.create(name='Olma', unit='kg', category=category)
    cp = CityProduct.objects.create(city=city, product=product, price='19300.00')
    slot = DeliverySlot.objects.create(city=city, start_time='09:00', end_time='23:00', lead_minutes=0)
    client = APIClient()
    payload = {
        'customer_name': 'Aziz', 'phone': '+998901234567', 'address': 'Chilonzor 5',
        'delivery_date': str(__import__('datetime').date.today()),
        'delivery_slot_id': slot.id,
        'items': [{'city_product': cp.id, 'qty': '1.000'}],
    }
    body = client.post('/api/orders/', payload, format='json', HTTP_X_CITY_ID=str(city.id)).json()
    assert body['status'] == 'new'
    assert body['status_label'] == 'Yangi'
    assert body['status_step'] == 1
    assert body['status_total'] == 5          # six stages minus the canceled one
    assert body['is_final'] is False and body['is_canceled'] is False
    assert Order.objects.get(pk=body['id']).stage.code == 'new'


@pytest.mark.django_db
def test_canceled_order_reports_zero_step(city):
    order = Order.objects.create(city=city, customer_name='A', phone='+998901234567', total='0')
    order.stage = OrderStage.objects.get(city=city, code='canceled')
    order.save(update_fields=['stage'])
    from apps.orders.serializers import OrderSerializer
    data = OrderSerializer(order).data
    assert data['status'] == 'canceled' and data['status_step'] == 0 and data['is_canceled'] is True
```

- [ ] **Step 2: Run to verify they fail**

From `backend/`: `PY -m pytest apps/orders/test_stages.py -q` → FAIL (`cannot import name 'OrderStage'`).
(`PY` is `D:\Proekt\Django\tezxarid\venv\Scripts\python.exe`.)

- [ ] **Step 3: Model the stages**

In `backend/apps/orders/models.py`, add above `Order` (keep `DeliverySlot` where it is):
```python
from django.core.exceptions import ValidationError


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
```
Replace `Order.status` with the stage link and delete the `Status` class:
```python
    stage = models.ForeignKey(OrderStage, null=True, blank=True, on_delete=models.PROTECT, related_name='orders')
```

- [ ] **Step 4: Stage helpers and the seeding signal**

Append to `backend/apps/orders/stages.py`:
```python
DEFAULT_STAGES = [
    {'code': 'new', 'name': 'Yangi', 'sort_order': 10, 'is_initial': True},
    {'code': 'accepted', 'name': 'Tasdiqlandi', 'sort_order': 20},
    {'code': 'preparing', 'name': "Yig'ilmoqda", 'sort_order': 30},
    {'code': 'delivering', 'name': "Yo'lda", 'sort_order': 40},
    {'code': 'done', 'name': 'Yetkazildi', 'sort_order': 50, 'is_final': True},
    {'code': 'canceled', 'name': 'Bekor qilindi', 'sort_order': 60, 'is_canceled': True},
]


def seed_stages(city_id, stage_model):
    """Create the default stage set for a city. Idempotent; takes the model so migrations can reuse it."""
    for spec in DEFAULT_STAGES:
        stage_model.objects.get_or_create(
            city_id=city_id, code=spec['code'],
            defaults={
                'name': spec['name'], 'sort_order': spec['sort_order'],
                'is_initial': spec.get('is_initial', False),
                'is_final': spec.get('is_final', False),
                'is_canceled': spec.get('is_canceled', False),
            },
        )


def stage_positions(city_id, cache):
    """{stage_id: (step, total)} over the city's active non-cancel stages, memoised in `cache`."""
    if city_id not in cache:
        from .models import OrderStage
        stages = list(OrderStage.objects.filter(city_id=city_id, is_active=True, is_canceled=False)
                      .order_by('sort_order'))
        cache[city_id] = {s.id: (i + 1, len(stages)) for i, s in enumerate(stages)}
    return cache[city_id]
```
Create `backend/apps/orders/signals.py`:
```python
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
```
In `backend/apps/orders/apps.py` add to the config class:
```python
    def ready(self):
        from . import signals  # noqa: F401
```

- [ ] **Step 5: Migration**

Create `backend/apps/orders/migrations/0003_order_stages.py`:
```python
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
        ('orders', '0002_delivery_slots'),
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
```
Check the real name of the previous migration first: `ls backend/apps/orders/migrations/` and use it in `dependencies`.

- [ ] **Step 6: Serializer and order creation**

In `backend/apps/orders/serializers.py` import the helper and replace the read serializer's status handling:
```python
from .models import DeliverySlot, Order, OrderItem, OrderStage
from . import slots
from .stages import stage_positions
```
```python
class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    delivery_start = serializers.TimeField(format='%H:%M', read_only=True)
    delivery_end = serializers.TimeField(format='%H:%M', read_only=True)
    status = serializers.CharField(source='stage.code', read_only=True, default='new')
    status_label = serializers.CharField(source='stage.name', read_only=True, default='Yangi')
    status_step = serializers.SerializerMethodField()
    status_total = serializers.SerializerMethodField()
    is_final = serializers.BooleanField(source='stage.is_final', read_only=True, default=False)
    is_canceled = serializers.BooleanField(source='stage.is_canceled', read_only=True, default=False)

    class Meta:
        model = Order
        fields = ['id', 'city', 'customer_name', 'phone', 'address', 'latitude',
                  'longitude', 'comment', 'status', 'status_label', 'status_step', 'status_total',
                  'is_final', 'is_canceled', 'payment_type', 'total',
                  'delivery_date', 'delivery_start', 'delivery_end',
                  'created_at', 'items']
        read_only_fields = list(fields)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._stage_cache = {}          # one lookup per city, not per order

    def _position(self, obj):
        if obj.stage_id is None or obj.stage.is_canceled:
            return (0, len(stage_positions(obj.city_id, self._stage_cache)))
        return stage_positions(obj.city_id, self._stage_cache).get(obj.stage_id, (0, 0))

    def get_status_step(self, obj) -> int:
        return self._position(obj)[0]

    def get_status_total(self, obj) -> int:
        return self._position(obj)[1]
```
In `OrderCreateSerializer.create`, pass the stage into `Order.objects.create(...)`:
```python
            stage=OrderStage.initial_for(city),
```

- [ ] **Step 7: Django admin**

In `backend/apps/orders/admin.py` register the stage and swap the status column:
```python
from .models import DeliverySlot, Order, OrderItem, OrderStage


@admin.register(OrderStage)
class OrderStageAdmin(CityScopedAdmin):
    city_field = 'city'
    list_display = ['city', 'sort_order', 'name', 'code', 'is_initial', 'is_final', 'is_canceled', 'is_active']
    list_editable = ['sort_order', 'name', 'is_active']
    list_filter = ['city', 'is_active']
```
In `OrderAdmin` replace `'status'` with `'stage'` in `list_display` and `list_filter`, and scope the FK inside `formfield_for_foreignkey`:
```python
            elif db_field.name == 'stage':
                kwargs['queryset'] = OrderStage.objects.filter(city_id=_scoped_city_id(request))
```

- [ ] **Step 8: Run the full backend suite**

From `backend/`: `PY -m pytest -q` → all pass. Existing order tests that asserted `status == 'new'` keep passing because the serializer still exposes `status`. Fix any test that wrote `Order(status=...)` directly by using `stage=OrderStage.objects.get(city=city, code=...)`.

- [ ] **Step 9: Commit**

```bash
git add backend/apps/orders backend/apps/orders/migrations
git commit -m "feat(api): per-city order stages replace the fixed status field; orders report stage label and progress"
```

---

## Task 2: Backend — `OrderEvent`, operator permission, city scoping, password login

**Files:**
- Create: `backend/apps/common/permissions.py`, `backend/apps/users/test_operator_login.py`
- Modify: `backend/apps/orders/models.py`, `backend/apps/orders/admin.py`, `backend/apps/common/city.py`, `backend/apps/users/serializers.py`, `backend/apps/users/views.py`, `backend/apps/users/urls.py`
- Create migration: `backend/apps/orders/migrations/0004_order_event.py` (generated)

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/users/test_operator_login.py`:
```python
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from apps.cities.models import City

User = get_user_model()
LOGIN = '/api/auth/login/'


@pytest.fixture
def city(db):
    return City.objects.create(name='Guliston', slug='guliston')


@pytest.fixture
def operator(city):
    return User.objects.create_user(username='op', password='secret123', role=User.Role.CITY_ADMIN,
                                    city=city, is_staff=True)


@pytest.mark.django_db
def test_login_returns_tokens_and_profile(operator, city):
    res = APIClient().post(LOGIN, {'username': 'op', 'password': 'secret123'}, format='json')
    assert res.status_code == 200
    body = res.json()
    assert body['access'] and body['refresh']
    assert body['user'] == {'id': operator.id, 'username': 'op', 'first_name': '',
                            'role': 'city_admin', 'city': city.id, 'city_name': 'Guliston'}


@pytest.mark.django_db
def test_login_rejects_a_wrong_password(operator):
    res = APIClient().post(LOGIN, {'username': 'op', 'password': 'nope'}, format='json')
    assert res.status_code == 400


@pytest.mark.django_db
def test_login_rejects_a_customer_account(city):
    User.objects.create_user(username='cust', password='secret123')
    res = APIClient().post(LOGIN, {'username': 'cust', 'password': 'secret123'}, format='json')
    assert res.status_code == 403
```

- [ ] **Step 2: Run to verify they fail**

`PY -m pytest apps/users/test_operator_login.py -q` → FAIL (404 for `/api/auth/login/`).

- [ ] **Step 3: `OrderEvent`**

Append to `backend/apps/orders/models.py`:
```python
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
```
Generate the migration: `PY manage.py makemigrations orders -n order_event`.
Add a read-only inline to `OrderAdmin` in `backend/apps/orders/admin.py`:
```python
class OrderEventInline(admin.TabularInline):
    model = OrderEvent
    extra = 0
    can_delete = False
    readonly_fields = ['kind', 'actor', 'from_stage', 'to_stage', 'note', 'created_at']

    def has_add_permission(self, request, obj=None):
        return False
```
and `inlines = [OrderItemInline, OrderEventInline]`.

- [ ] **Step 4: Permission and operator city scoping**

Create `backend/apps/common/permissions.py`:
```python
from rest_framework.permissions import BasePermission

OPERATOR_ROLES = {'city_admin', 'superadmin'}


def is_operator(user):
    """Operator console access: any superuser, or staff with an operator role."""
    if not user or not user.is_authenticated:
        return False
    return bool(user.is_superuser or getattr(user, 'role', None) in OPERATOR_ROLES)


def is_global_operator(user):
    """Sees every city and may switch with X-City-Id."""
    return bool(user.is_superuser or getattr(user, 'role', None) == 'superadmin')


class IsOperator(BasePermission):
    message = 'Operator access required.'

    def has_permission(self, request, view):
        return is_operator(request.user)
```
Append to `backend/apps/common/city.py`:
```python
from rest_framework.exceptions import PermissionDenied
from .permissions import IsOperator, is_global_operator


def resolve_operator_city(request):
    """A city operator is pinned to their own city; a global operator picks one with X-City-Id."""
    if is_global_operator(request.user):
        return resolve_city(request)
    city = getattr(request.user, 'city', None)
    if city is None or not city.is_active:
        raise PermissionDenied('This operator is not attached to an active city.')
    return city


class OperatorAPIView(APIView):
    """Base view for /api/operator/: operator-only, with self.city resolved from the account."""
    permission_classes = [IsOperator]

    @property
    def city(self):
        if not hasattr(self, '_city'):
            self._city = resolve_operator_city(self.request)
        return self._city
```

- [ ] **Step 5: Login endpoint**

Append to `backend/apps/users/serializers.py`:
```python
class OperatorLoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(max_length=128, trim_whitespace=False)


class OperatorUserSerializer(serializers.ModelSerializer):
    """The operator's own identity, returned with the token pair."""
    city_name = serializers.CharField(source='city.name', read_only=True, default='')

    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'role', 'city', 'city_name']
        read_only_fields = list(fields)
```
Append to `backend/apps/users/views.py`:
```python
from django.contrib.auth import authenticate
from rest_framework.throttling import AnonRateThrottle
from apps.common.permissions import is_operator
from .serializers import MeSerializer, OperatorLoginSerializer, OperatorUserSerializer, TelegramAuthSerializer


class OperatorLoginThrottle(AnonRateThrottle):
    """The console is on the public frontend: slow down password guessing."""
    scope = 'operator_login'
    rate = '10/min'


class OperatorLoginView(APIView):
    """Username + password sign-in for the order admin console."""
    throttle_classes = [OperatorLoginThrottle]

    def post(self, request):
        serializer = OperatorLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(request,
                            username=serializer.validated_data['username'],
                            password=serializer.validated_data['password'])
        if user is None:
            return Response({'detail': "Login yoki parol noto'g'ri."}, status=status.HTTP_400_BAD_REQUEST)
        if not is_operator(user):
            return Response({'detail': 'Operator access required.'}, status=status.HTTP_403_FORBIDDEN)
        refresh = RefreshToken.for_user(user)
        return Response({'access': str(refresh.access_token), 'refresh': str(refresh),
                         'user': OperatorUserSerializer(user).data})
```
In `backend/apps/users/urls.py` add `path('login/', OperatorLoginView.as_view(), name='operator-login'),` and import it.

- [ ] **Step 6: Run the tests**

`PY -m pytest apps/users/test_operator_login.py -q` → 3 passed. Then `PY -m pytest -q` → all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/common/permissions.py backend/apps/common/city.py backend/apps/orders backend/apps/users
git commit -m "feat(api): order event log, operator permission and city scoping, password login for operators"
```

---

## Task 3: Backend — operator stages, orders list and detail

**Files:**
- Create: `backend/apps/orders/operator_serializers.py`, `backend/apps/orders/operator_views.py`, `backend/apps/orders/operator_urls.py`, `backend/apps/orders/test_operator_orders.py`
- Modify: `backend/config/urls.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/orders/test_operator_orders.py`:
```python
import datetime as dt
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from apps.catalog.models import Category, CityProduct, Product
from apps.cities.models import City
from apps.orders.models import DeliverySlot, Order, OrderItem, OrderStage

User = get_user_model()


def client_for(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')
    return client


@pytest.fixture
def city(db):
    return City.objects.create(name='Guliston', slug='guliston')


@pytest.fixture
def other_city(db):
    return City.objects.create(name='Toshkent', slug='toshkent')


@pytest.fixture
def operator(city):
    return User.objects.create_user(username='op', password='x', role=User.Role.CITY_ADMIN, city=city, is_staff=True)


@pytest.fixture
def product(city):
    category = Category.objects.create(name='Mevalar')
    item = Product.objects.create(name='Olma', unit='kg', category=category)
    return CityProduct.objects.create(city=city, product=item, price='19300.00')


def make_order(city, code='new', name='Aziz', phone='+998901234567', product=None):
    order = Order.objects.create(
        city=city, customer_name=name, phone=phone, address='Chilonzor 5', total='19300.00',
        delivery_date=dt.date(2026, 9, 21), delivery_start=dt.time(9), delivery_end=dt.time(12),
        stage=OrderStage.objects.get(city=city, code=code))
    if product is not None:
        OrderItem.objects.create(order=order, city_product=product, qty='1.000', price_snapshot=product.price)
    return order


@pytest.mark.django_db
def test_operator_endpoints_reject_customers_and_anonymous(city):
    customer = User.objects.create_user(username='cust', password='x')
    assert APIClient().get('/api/operator/orders/').status_code == 401
    assert client_for(customer).get('/api/operator/orders/').status_code == 403


@pytest.mark.django_db
def test_stages_list_returns_the_operator_city_pipeline(operator, city):
    body = client_for(operator).get('/api/operator/stages/').json()
    assert [s['code'] for s in body] == ['new', 'accepted', 'preparing', 'delivering', 'done', 'canceled']
    assert body[0]['name'] == 'Yangi' and body[0]['is_initial'] is True


@pytest.mark.django_db
def test_orders_list_is_scoped_counted_and_filterable(operator, city, other_city, product):
    make_order(city, 'new', product=product)
    make_order(city, 'accepted', name='Dilnoza', phone='+998977654321')
    make_order(other_city, 'new', name='Begona')
    body = client_for(operator).get('/api/operator/orders/').json()
    assert body['count'] == 2
    assert 'Begona' not in str(body)
    assert body['counts']['new'] == 1 and body['counts']['accepted'] == 1 and body['counts']['done'] == 0
    assert body['results'][0]['items_count'] in (0, 1)

    only_new = client_for(operator).get('/api/operator/orders/?stage=new').json()
    assert only_new['count'] == 1 and only_new['results'][0]['stage'] == 'new'

    found = client_for(operator).get('/api/operator/orders/?q=977654').json()
    assert found['count'] == 1 and found['results'][0]['customer_name'] == 'Dilnoza'

    by_date = client_for(operator).get('/api/operator/orders/?date=2026-09-21').json()
    assert by_date['count'] == 2


@pytest.mark.django_db
def test_order_detail_has_items_customer_and_events(operator, city, product):
    order = make_order(city, product=product)
    body = client_for(operator).get(f'/api/operator/orders/{order.id}/').json()
    assert body['id'] == order.id
    assert body['stage'] == 'new' and body['stage_name'] == 'Yangi'
    assert body['items'][0]['name'] == 'Olma' and body['items'][0]['unit'] == 'kg'
    assert body['items'][0]['line_total'] == '19300.00'
    assert body['delivery_window'] == '09:00 – 12:00'
    assert body['events'] == []


@pytest.mark.django_db
def test_another_citys_order_is_not_found(operator, other_city):
    order = make_order(other_city)
    assert client_for(operator).get(f'/api/operator/orders/{order.id}/').status_code == 404
```

- [ ] **Step 2: Run to verify they fail**

`PY -m pytest apps/orders/test_operator_orders.py -q` → FAIL (404 everywhere).

- [ ] **Step 3: Serializers**

Create `backend/apps/orders/operator_serializers.py`:
```python
from rest_framework import serializers
from .models import Order, OrderEvent, OrderItem, OrderStage


class OperatorStageSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderStage
        fields = ['id', 'code', 'name', 'sort_order', 'is_initial', 'is_final', 'is_canceled']
        read_only_fields = list(fields)


class OperatorOrderItemSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='city_product.product.name', read_only=True)
    unit = serializers.CharField(source='city_product.product.unit', read_only=True)
    step = serializers.DecimalField(source='city_product.product.step', max_digits=6, decimal_places=3, read_only=True)
    line_total = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = ['id', 'city_product', 'name', 'unit', 'step', 'qty', 'price_snapshot', 'line_total']
        read_only_fields = list(fields)

    def get_line_total(self, obj) -> str:
        return f'{obj.qty * obj.price_snapshot:.2f}'


class OperatorEventSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source='actor.username', read_only=True, default='')
    from_stage_name = serializers.CharField(source='from_stage.name', read_only=True, default='')
    to_stage_name = serializers.CharField(source='to_stage.name', read_only=True, default='')

    class Meta:
        model = OrderEvent
        fields = ['id', 'kind', 'actor_name', 'from_stage_name', 'to_stage_name', 'note', 'created_at']
        read_only_fields = list(fields)


def _window(obj):
    if not obj.delivery_start or not obj.delivery_end:
        return ''
    return f'{obj.delivery_start:%H:%M} – {obj.delivery_end:%H:%M}'


class OperatorOrderListSerializer(serializers.ModelSerializer):
    stage = serializers.CharField(source='stage.code', read_only=True, default='')
    stage_name = serializers.CharField(source='stage.name', read_only=True, default='')
    delivery_window = serializers.SerializerMethodField()
    items_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Order
        fields = ['id', 'customer_name', 'phone', 'address', 'total', 'stage', 'stage_name',
                  'delivery_date', 'delivery_window', 'items_count', 'created_at', 'user']
        read_only_fields = list(fields)

    def get_delivery_window(self, obj) -> str:
        return _window(obj)


class OperatorOrderSerializer(serializers.ModelSerializer):
    stage = serializers.CharField(source='stage.code', read_only=True, default='')
    stage_name = serializers.CharField(source='stage.name', read_only=True, default='')
    stage_id = serializers.IntegerField(read_only=True)
    is_terminal = serializers.SerializerMethodField()
    delivery_window = serializers.SerializerMethodField()
    items = OperatorOrderItemSerializer(many=True, read_only=True)
    events = OperatorEventSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = ['id', 'city', 'user', 'customer_name', 'phone', 'address', 'latitude', 'longitude',
                  'comment', 'payment_type', 'total', 'stage', 'stage_id', 'stage_name', 'is_terminal',
                  'delivery_date', 'delivery_start', 'delivery_end', 'delivery_window', 'delivery_slot',
                  'created_at', 'updated_at', 'items', 'events']
        read_only_fields = list(fields)

    def get_is_terminal(self, obj) -> bool:
        return bool(obj.stage and (obj.stage.is_final or obj.stage.is_canceled))

    def get_delivery_window(self, obj) -> str:
        return _window(obj)
```

- [ ] **Step 4: Views and routes**

Create `backend/apps/orders/operator_views.py`:
```python
from django.db.models import Count, Q
from rest_framework.response import Response
from apps.common.city import OperatorAPIView
from .models import Order, OrderStage
from .operator_serializers import (OperatorOrderListSerializer, OperatorOrderSerializer,
                                   OperatorStageSerializer)

MAX_PAGE = 200
DEFAULT_PAGE = 50


def _page(request):
    try:
        limit = min(int(request.query_params.get('limit', DEFAULT_PAGE)), MAX_PAGE)
        offset = max(int(request.query_params.get('offset', 0)), 0)
    except (TypeError, ValueError):
        limit, offset = DEFAULT_PAGE, 0
    return max(limit, 1), offset


class StageListView(OperatorAPIView):
    """GET: the operator city's pipeline, in order."""

    def get(self, request):
        stages = OrderStage.objects.filter(city=self.city, is_active=True).order_by('sort_order')
        return Response(OperatorStageSerializer(stages, many=True).data)


class OrderListView(OperatorAPIView):
    """GET: the city's orders with per-stage counts, filtered by stage, delivery date and free text."""

    def get(self, request):
        base = Order.objects.filter(city=self.city)
        counts = {code: 0 for code in
                  OrderStage.objects.filter(city=self.city, is_active=True)
                  .order_by('sort_order').values_list('code', flat=True)}
        for row in base.values('stage__code').annotate(n=Count('id')):
            if row['stage__code'] in counts:
                counts[row['stage__code']] = row['n']

        qs = base.select_related('stage').annotate(items_count=Count('items'))
        stage = request.query_params.get('stage')
        if stage:
            qs = qs.filter(stage__code=stage)
        date = request.query_params.get('date')
        if date:
            qs = qs.filter(delivery_date=date)
        q = (request.query_params.get('q') or '').strip()
        if q:
            match = Q(customer_name__icontains=q) | Q(phone__icontains=q) | Q(address__icontains=q)
            if q.isdigit():
                match |= Q(pk=int(q))
            qs = qs.filter(match)
        total = qs.count()
        limit, offset = _page(request)
        rows = qs.order_by('-created_at')[offset:offset + limit]
        return Response({'count': total, 'counts': counts,
                         'results': OperatorOrderListSerializer(rows, many=True).data})


class OrderDetailView(OperatorAPIView):
    """GET: one order of the operator's city with items and the event log."""

    def get_object(self, pk):
        from django.shortcuts import get_object_or_404
        return get_object_or_404(
            Order.objects.filter(city=self.city)
            .select_related('stage', 'delivery_slot', 'user')
            .prefetch_related('items__city_product__product', 'events__actor',
                              'events__from_stage', 'events__to_stage'),
            pk=pk)

    def get(self, request, pk):
        return Response(OperatorOrderSerializer(self.get_object(pk)).data)
```
Create `backend/apps/orders/operator_urls.py`:
```python
from django.urls import path
from .operator_views import OrderDetailView, OrderListView, StageListView

app_name = 'operator-orders'

urlpatterns = [
    path('stages/', StageListView.as_view(), name='stages'),
    path('orders/', OrderListView.as_view(), name='orders'),
    path('orders/<int:pk>/', OrderDetailView.as_view(), name='order-detail'),
]
```
In `backend/config/urls.py` add after the addresses line:
```python
    path('api/operator/', include('apps.orders.operator_urls')),
```

- [ ] **Step 5: Run the tests**

`PY -m pytest apps/orders/test_operator_orders.py -q` → 5 passed. Then `PY -m pytest -q` → all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/orders backend/config/urls.py
git commit -m "feat(api): operator stages and city-scoped order list/detail endpoints"
```

---

## Task 4: Backend — operator edits, item replacement, stage moves, events

**Files:**
- Modify: `backend/apps/orders/operator_serializers.py`, `backend/apps/orders/operator_views.py`, `backend/apps/orders/operator_urls.py`
- Create: `backend/apps/orders/test_operator_edit.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/orders/test_operator_edit.py`:
```python
import datetime as dt
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from apps.catalog.models import Category, CityProduct, Product
from apps.cities.models import City
from apps.orders.models import DeliverySlot, Order, OrderEvent, OrderItem, OrderStage

User = get_user_model()


def client_for(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')
    return client


@pytest.fixture
def city(db):
    return City.objects.create(name='Guliston', slug='guliston')


@pytest.fixture
def operator(city):
    return User.objects.create_user(username='op', password='x', role=User.Role.CITY_ADMIN, city=city, is_staff=True)


@pytest.fixture
def products(city):
    category = Category.objects.create(name='Mevalar')
    olma = Product.objects.create(name='Olma', unit='kg', step='0.5', category=category)
    non = Product.objects.create(name='Non', unit='sht', step='1', category=category)
    return (CityProduct.objects.create(city=city, product=olma, price='10000.00'),
            CityProduct.objects.create(city=city, product=non, price='3000.00'))


@pytest.fixture
def order(city, products):
    olma, _ = products
    o = Order.objects.create(city=city, customer_name='Aziz', phone='+998901234567', address='Chilonzor 5',
                             total='20000.00', stage=OrderStage.objects.get(city=city, code='new'))
    OrderItem.objects.create(order=o, city_product=olma, qty='2.000', price_snapshot='10000.00')
    return o


@pytest.mark.django_db
def test_patch_updates_customer_fields_and_logs_an_edit(operator, order):
    res = client_for(operator).patch(f'/api/operator/orders/{order.id}/',
                                     {'customer_name': 'Aziz Karimov', 'comment': 'Eshik oldiga'}, format='json')
    assert res.status_code == 200
    order.refresh_from_db()
    assert order.customer_name == 'Aziz Karimov' and order.comment == 'Eshik oldiga'
    assert order.events.filter(kind=OrderEvent.Kind.EDITED).count() == 1


@pytest.mark.django_db
def test_patch_reassigns_the_delivery_slot_and_resnapshots_the_window(operator, order, city):
    slot = DeliverySlot.objects.create(city=city, start_time=dt.time(16), end_time=dt.time(19))
    res = client_for(operator).patch(f'/api/operator/orders/{order.id}/',
                                     {'delivery_slot_id': slot.id, 'delivery_date': '2026-09-25'}, format='json')
    assert res.status_code == 200
    order.refresh_from_db()
    assert order.delivery_slot_id == slot.id
    assert order.delivery_start == dt.time(16) and order.delivery_end == dt.time(19)


@pytest.mark.django_db
def test_items_are_replaced_with_kept_prices_and_a_new_total(operator, order, products):
    olma, non = products
    non.price = '3500.00'
    non.save(update_fields=['price'])
    res = client_for(operator).put(f'/api/operator/orders/{order.id}/items/',
                                   {'items': [{'city_product': olma.id, 'qty': '1.500'},
                                              {'city_product': non.id, 'qty': '2.000'}]}, format='json')
    assert res.status_code == 200
    order.refresh_from_db()
    lines = {i.city_product_id: i for i in order.items.all()}
    assert str(lines[olma.id].price_snapshot) == '10000.00'     # existing line keeps its price
    assert str(lines[non.id].price_snapshot) == '3500.00'       # new line takes the current price
    assert str(order.total) == '22000.00'                       # 1.5*10000 + 2*3500
    assert order.events.filter(kind=OrderEvent.Kind.EDITED).exists()


@pytest.mark.django_db
def test_items_reject_a_bad_step_and_an_empty_list(operator, order, products):
    olma, _ = products
    bad = client_for(operator).put(f'/api/operator/orders/{order.id}/items/',
                                   {'items': [{'city_product': olma.id, 'qty': '0.300'}]}, format='json')
    assert bad.status_code == 400
    empty = client_for(operator).put(f'/api/operator/orders/{order.id}/items/', {'items': []}, format='json')
    assert empty.status_code == 400


@pytest.mark.django_db
def test_stage_move_logs_the_transition(operator, order, city):
    res = client_for(operator).post(f'/api/operator/orders/{order.id}/stage/', {'stage': 'accepted'}, format='json')
    assert res.status_code == 200 and res.json()['stage'] == 'accepted'
    event = order.events.get(kind=OrderEvent.Kind.STAGE)
    assert event.from_stage.code == 'new' and event.to_stage.code == 'accepted' and event.actor_id == operator.id


@pytest.mark.django_db
def test_cancel_needs_a_reason_and_then_freezes_the_order(operator, order):
    without = client_for(operator).post(f'/api/operator/orders/{order.id}/stage/',
                                        {'stage': 'canceled'}, format='json')
    assert without.status_code == 400
    ok = client_for(operator).post(f'/api/operator/orders/{order.id}/stage/',
                                   {'stage': 'canceled', 'note': 'Mijoz rad etdi'}, format='json')
    assert ok.status_code == 200
    blocked = client_for(operator).patch(f'/api/operator/orders/{order.id}/',
                                         {'comment': 'kech'}, format='json')
    assert blocked.status_code == 400


@pytest.mark.django_db
def test_call_and_print_events_are_recorded(operator, order):
    res = client_for(operator).post(f'/api/operator/orders/{order.id}/events/', {'kind': 'called'}, format='json')
    assert res.status_code == 201
    assert order.events.filter(kind=OrderEvent.Kind.CALLED).count() == 1
    bad = client_for(operator).post(f'/api/operator/orders/{order.id}/events/', {'kind': 'stage'}, format='json')
    assert bad.status_code == 400
```

- [ ] **Step 2: Run to verify they fail**

`PY -m pytest apps/orders/test_operator_edit.py -q` → FAIL (405/404).

- [ ] **Step 3: Write serializers**

Append to `backend/apps/orders/operator_serializers.py`:
```python
from decimal import Decimal
from django.core.validators import MaxValueValidator, MinValueValidator
from apps.catalog.models import CityProduct
from apps.common.validators import PHONE_VALIDATOR
from .models import DeliverySlot

MAX_ORDER_ITEMS = 100
LAT_VALIDATORS = [MinValueValidator(Decimal('-90')), MaxValueValidator(Decimal('90'))]
LNG_VALIDATORS = [MinValueValidator(Decimal('-180')), MaxValueValidator(Decimal('180'))]


class OperatorOrderPatchSerializer(serializers.ModelSerializer):
    """Fields an operator may change while on the phone with the customer."""
    phone = serializers.CharField(max_length=20, required=False, validators=[PHONE_VALIDATOR])
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True,
                                        validators=LAT_VALIDATORS)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True,
                                         validators=LNG_VALIDATORS)
    delivery_slot_id = serializers.IntegerField(required=False, allow_null=True, min_value=1)

    class Meta:
        model = Order
        fields = ['customer_name', 'phone', 'address', 'latitude', 'longitude', 'comment',
                  'payment_type', 'delivery_date', 'delivery_slot_id']

    def validate_delivery_slot_id(self, value):
        if value is None:
            return value
        city = self.context['city']
        if not DeliverySlot.objects.filter(pk=value, city=city, is_active=True).exists():
            raise serializers.ValidationError('Delivery slot not available in this city.')
        return value

    def update(self, instance, validated_data):
        # The operator agreed the window by phone, so lead time is not enforced here.
        slot_id = validated_data.pop('delivery_slot_id', 'absent')
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if slot_id != 'absent':
            instance.delivery_slot_id = slot_id
            slot = DeliverySlot.objects.filter(pk=slot_id).first() if slot_id else None
            instance.delivery_start = slot.start_time if slot else None
            instance.delivery_end = slot.end_time if slot else None
        instance.save()
        return instance


class OperatorItemInputSerializer(serializers.Serializer):
    city_product = serializers.PrimaryKeyRelatedField(
        queryset=CityProduct.objects.select_related('product'))
    qty = serializers.DecimalField(max_digits=8, decimal_places=3, min_value=Decimal('0.001'))


class OperatorItemsSerializer(serializers.Serializer):
    """Full replacement of an order's lines."""
    items = OperatorItemInputSerializer(many=True, max_length=MAX_ORDER_ITEMS)

    def validate_items(self, items):
        if not items:
            raise serializers.ValidationError('At least one item is required.')
        city = self.context['city']
        for item in items:
            cp = item['city_product']
            if cp.city_id != city.id:
                raise serializers.ValidationError('All items must belong to the order city.')
            step = cp.product.step or Decimal('1')
            if (item['qty'] % step) != 0:
                raise serializers.ValidationError(f'{cp.product.name}: quantity must be a multiple of {step}.')
        return items


class StageMoveSerializer(serializers.Serializer):
    stage = serializers.CharField(max_length=32)
    note = serializers.CharField(max_length=500, required=False, allow_blank=True, default='')


class EventCreateSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=[OrderEvent.Kind.CALLED, OrderEvent.Kind.PRINTED])
    note = serializers.CharField(max_length=500, required=False, allow_blank=True, default='')
```

- [ ] **Step 4: Write the views**

Append to `backend/apps/orders/operator_views.py`:
```python
from django.db import transaction
from rest_framework import status
from .models import OrderEvent, OrderItem
from .operator_serializers import (EventCreateSerializer, OperatorEventSerializer, OperatorItemsSerializer,
                                   OperatorOrderPatchSerializer, StageMoveSerializer)

TERMINAL_MSG = 'This order is already closed.'


def _log(order, actor, kind, note='', from_stage=None, to_stage=None):
    OrderEvent.objects.create(order=order, actor=actor, kind=kind, note=note,
                              from_stage=from_stage, to_stage=to_stage)


def _recalculate(order):
    total = sum((i.qty * i.price_snapshot for i in order.items.all()), Decimal('0'))
    order.total = total
    order.save(update_fields=['total', 'updated_at'])
    return total
```
Add `from decimal import Decimal` at the top. Extend `OrderDetailView` with `patch`:
```python
    def patch(self, request, pk):
        order = self.get_object(pk)
        if order.stage and (order.stage.is_final or order.stage.is_canceled):
            return Response({'detail': TERMINAL_MSG}, status=status.HTTP_400_BAD_REQUEST)
        serializer = OperatorOrderPatchSerializer(order, data=request.data, partial=True,
                                                  context={'city': self.city})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        _log(order, request.user, OrderEvent.Kind.EDITED,
             note=', '.join(sorted(serializer.validated_data)))
        return Response(OperatorOrderSerializer(self.get_object(pk)).data)
```
Then the three action views:
```python
class OrderItemsView(OrderDetailView):
    """PUT: replace every line of the order and recalculate the total."""

    @transaction.atomic
    def put(self, request, pk):
        order = self.get_object(pk)
        if order.stage and (order.stage.is_final or order.stage.is_canceled):
            return Response({'detail': TERMINAL_MSG}, status=status.HTTP_400_BAD_REQUEST)
        serializer = OperatorItemsSerializer(data=request.data, context={'city': self.city})
        serializer.is_valid(raise_exception=True)
        kept = {i.city_product_id: i.price_snapshot for i in order.items.all()}
        order.items.all().delete()
        OrderItem.objects.bulk_create([
            OrderItem(order=order, city_product=row['city_product'], qty=row['qty'],
                      price_snapshot=kept.get(row['city_product'].id, row['city_product'].price))
            for row in serializer.validated_data['items']
        ])
        order.refresh_from_db()
        _recalculate(order)
        _log(order, request.user, OrderEvent.Kind.EDITED, note='items')
        return Response(OperatorOrderSerializer(self.get_object(pk)).data)


class OrderStageView(OrderDetailView):
    """POST: move the order to another stage of this city."""

    def post(self, request, pk):
        order = self.get_object(pk)
        serializer = StageMoveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if order.stage and (order.stage.is_final or order.stage.is_canceled):
            return Response({'detail': TERMINAL_MSG}, status=status.HTTP_400_BAD_REQUEST)
        target = OrderStage.objects.filter(city=self.city, is_active=True,
                                           code=serializer.validated_data['stage']).first()
        if target is None:
            return Response({'stage': 'Unknown stage for this city.'}, status=status.HTTP_400_BAD_REQUEST)
        note = serializer.validated_data['note'].strip()
        if target.is_canceled and not note:
            return Response({'note': 'A cancellation needs a reason.'}, status=status.HTTP_400_BAD_REQUEST)
        previous = order.stage
        order.stage = target
        order.save(update_fields=['stage', 'updated_at'])
        _log(order, request.user, OrderEvent.Kind.STAGE, note=note, from_stage=previous, to_stage=target)
        return Response(OperatorOrderSerializer(self.get_object(pk)).data)


class OrderEventView(OrderDetailView):
    """POST: record that the operator called the customer or printed the receipt."""

    def post(self, request, pk):
        order = self.get_object(pk)
        serializer = EventCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        event = OrderEvent.objects.create(order=order, actor=request.user,
                                          kind=serializer.validated_data['kind'],
                                          note=serializer.validated_data['note'])
        return Response(OperatorEventSerializer(event).data, status=status.HTTP_201_CREATED)
```
Add the routes to `backend/apps/orders/operator_urls.py`:
```python
    path('orders/<int:pk>/items/', OrderItemsView.as_view(), name='order-items'),
    path('orders/<int:pk>/stage/', OrderStageView.as_view(), name='order-stage'),
    path('orders/<int:pk>/events/', OrderEventView.as_view(), name='order-events'),
```

- [ ] **Step 5: Run the tests**

`PY -m pytest apps/orders/test_operator_edit.py -q` → 7 passed. Then `PY -m pytest -q` → all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/orders
git commit -m "feat(api): operator order editing, item replacement, stage moves and call/print events"
```

---

## Task 5: Backend — operator product search and city customers

**Files:**
- Create: `backend/apps/users/operator_views.py`, `backend/apps/users/operator_urls.py`, `backend/apps/users/test_operator_customers.py`
- Modify: `backend/apps/orders/operator_views.py`, `backend/apps/orders/operator_urls.py`, `backend/config/urls.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/users/test_operator_customers.py`:
```python
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from apps.catalog.models import Category, CityProduct, Product
from apps.cities.models import City
from apps.orders.models import Order, OrderStage
from apps.users.models import Address

User = get_user_model()


def client_for(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')
    return client


@pytest.fixture
def city(db):
    return City.objects.create(name='Guliston', slug='guliston')


@pytest.fixture
def operator(city):
    return User.objects.create_user(username='op', password='x', role=User.Role.CITY_ADMIN, city=city, is_staff=True)


@pytest.mark.django_db
def test_customers_list_counts_orders_and_spend(operator, city):
    buyer = User.objects.create_user(username='tg_1', telegram_id=1, first_name='Aziz', phone='+998901234567')
    stage = OrderStage.objects.get(city=city, code='new')
    Order.objects.create(city=city, user=buyer, customer_name='Aziz', phone='+998901234567', total='10000.00', stage=stage)
    Order.objects.create(city=city, user=buyer, customer_name='Aziz', phone='+998901234567', total='5000.00', stage=stage)
    Order.objects.create(city=city, customer_name='Mehmon', phone='+998911111111', total='7000.00', stage=stage)
    body = client_for(operator).get('/api/operator/customers/').json()
    assert body['count'] == 1                      # the guest order has no user
    row = body['results'][0]
    assert row['id'] == buyer.id and row['orders_count'] == 2 and row['orders_total'] == '15000.00'
    assert row['phone'] == '+998901234567' and row['name'] == 'Aziz'


@pytest.mark.django_db
def test_customers_list_includes_profile_city_members_and_searches(operator, city):
    User.objects.create_user(username='tg_2', telegram_id=2, first_name='Dilnoza',
                            phone='+998977654321', city=city)
    body = client_for(operator).get('/api/operator/customers/?q=dil').json()
    assert body['count'] == 1 and body['results'][0]['name'] == 'Dilnoza'
    assert body['results'][0]['orders_count'] == 0


@pytest.mark.django_db
def test_customer_detail_returns_addresses_and_city_orders(operator, city):
    other = City.objects.create(name='Toshkent', slug='toshkent')
    buyer = User.objects.create_user(username='tg_3', telegram_id=3, first_name='Aziz')
    Address.objects.create(user=buyer, city=city, title='Uy', address='Chilonzor 5', is_default=True)
    Order.objects.create(city=city, user=buyer, customer_name='Aziz', phone='+998901234567',
                         total='10000.00', stage=OrderStage.objects.get(city=city, code='new'))
    Order.objects.create(city=other, user=buyer, customer_name='Aziz', phone='+998901234567',
                         total='9000.00', stage=OrderStage.objects.get(city=other, code='new'))
    body = client_for(operator).get(f'/api/operator/customers/{buyer.id}/').json()
    assert body['id'] == buyer.id
    assert [a['title'] for a in body['addresses']] == ['Uy']
    assert len(body['orders']) == 1 and body['orders'][0]['total'] == '10000.00'


@pytest.mark.django_db
def test_operator_product_search_is_city_scoped(operator, city):
    other = City.objects.create(name='Toshkent', slug='toshkent')
    category = Category.objects.create(name='Mevalar')
    olma = Product.objects.create(name='Olma', unit='kg', category=category)
    banan = Product.objects.create(name='Banan', unit='kg', category=category)
    CityProduct.objects.create(city=city, product=olma, price='19300.00')
    CityProduct.objects.create(city=other, product=banan, price='24500.00')
    body = client_for(operator).get('/api/operator/products/?search=an').json()
    assert body == []
    body = client_for(operator).get('/api/operator/products/?search=ol').json()
    assert len(body) == 1 and body[0]['name'] == 'Olma' and body[0]['price'] == '19300.00'
```

- [ ] **Step 2: Run to verify they fail**

`PY -m pytest apps/users/test_operator_customers.py -q` → FAIL (404).

- [ ] **Step 3: Product search**

Append to `backend/apps/orders/operator_views.py`:
```python
from apps.catalog.models import CityProduct


class OperatorProductView(OperatorAPIView):
    """GET: the city's available products, for the item editor."""

    def get(self, request):
        search = (request.query_params.get('search') or '').strip()
        qs = (CityProduct.objects.filter(city=self.city, is_available=True, product__is_active=True)
              .select_related('product').order_by('product__name'))
        if search:
            qs = qs.filter(product__name__icontains=search)
        rows = [{'city_product_id': cp.id, 'name': cp.product.name, 'unit': cp.product.unit,
                 'step': str(cp.product.step), 'price': str(cp.price)} for cp in qs[:50]]
        return Response(rows)
```
Route: `path('products/', OperatorProductView.as_view(), name='products'),`

- [ ] **Step 4: Customers**

Create `backend/apps/users/operator_views.py`:
```python
from django.db.models import Count, DecimalField, Max, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from rest_framework.response import Response
from apps.common.city import OperatorAPIView
from apps.orders.models import Order
from apps.orders.operator_serializers import OperatorOrderSerializer
from .address_serializers import AddressSerializer
from .models import Address, User

DEFAULT_PAGE = 50
MAX_PAGE = 200
MONEY = DecimalField(max_digits=12, decimal_places=2)


def _customer_queryset(city):
    """Users who ordered in this city, plus customers whose profile city is this city."""
    return (User.objects
            .filter(Q(orders__city=city) | Q(city=city, role=User.Role.CUSTOMER))
            .distinct()
            .annotate(
                orders_count=Count('orders', filter=Q(orders__city=city), distinct=True),
                orders_total=Coalesce(Sum('orders__total', filter=Q(orders__city=city)), Value(0), output_field=MONEY),
                last_order_at=Max('orders__created_at', filter=Q(orders__city=city))))


def _row(user):
    name = f'{user.first_name} {user.last_name}'.strip() or user.username
    return {'id': user.id, 'name': name, 'username': user.username, 'phone': user.phone,
            'telegram_id': user.telegram_id, 'date_joined': user.date_joined,
            'orders_count': user.orders_count, 'orders_total': str(user.orders_total),
            'last_order_at': user.last_order_at}


class CustomerListView(OperatorAPIView):
    """GET: the city's customers with their order counts and spend."""

    def get(self, request):
        qs = _customer_queryset(self.city)
        q = (request.query_params.get('q') or '').strip()
        if q:
            qs = qs.filter(Q(first_name__icontains=q) | Q(last_name__icontains=q)
                           | Q(phone__icontains=q) | Q(username__icontains=q))
        total = qs.count()
        try:
            limit = min(int(request.query_params.get('limit', DEFAULT_PAGE)), MAX_PAGE)
            offset = max(int(request.query_params.get('offset', 0)), 0)
        except (TypeError, ValueError):
            limit, offset = DEFAULT_PAGE, 0
        rows = qs.order_by('-last_order_at', '-date_joined')[offset:offset + max(limit, 1)]
        return Response({'count': total, 'results': [_row(u) for u in rows]})


class CustomerDetailView(OperatorAPIView):
    """GET: one customer with their saved addresses and every order placed in this city."""

    def get(self, request, pk):
        user = get_object_or_404(_customer_queryset(self.city), pk=pk)
        orders = (Order.objects.filter(city=self.city, user=user)
                  .select_related('stage', 'delivery_slot', 'user')
                  .prefetch_related('items__city_product__product', 'events__actor',
                                    'events__from_stage', 'events__to_stage'))
        addresses = Address.objects.filter(user=user, city=self.city)
        body = _row(user)
        body['addresses'] = AddressSerializer(addresses, many=True).data
        body['orders'] = OperatorOrderSerializer(orders, many=True).data
        return Response(body)
```
Create `backend/apps/users/operator_urls.py`:
```python
from django.urls import path
from .operator_views import CustomerDetailView, CustomerListView

app_name = 'operator-customers'

urlpatterns = [
    path('', CustomerListView.as_view(), name='list'),
    path('<int:pk>/', CustomerDetailView.as_view(), name='detail'),
]
```
In `backend/config/urls.py`, **before** the `apps.orders.operator_urls` line:
```python
    path('api/operator/customers/', include('apps.users.operator_urls')),
```

- [ ] **Step 5: Run the tests**

`PY -m pytest apps/users/test_operator_customers.py -q` → 4 passed. Then `PY -m pytest -q` → all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/users backend/apps/orders backend/config/urls.py
git commit -m "feat(api): operator product search and city customer directory"
```

---

## Task 6: Frontend — two layout branches, operator session, guard and interceptor

**Files:**
- Create: `frontend/src/app/core/api/models/operator.models.ts`, `frontend/src/app/core/operator/operator.store.ts` (+spec), `frontend/src/app/core/operator/operator.guard.ts` (+spec), `frontend/src/app/core/operator/operator.interceptor.ts` (+spec)
- Modify: `frontend/src/app/app.ts`, `frontend/src/app/app.spec.ts`, `frontend/src/app/app.routes.ts`, `frontend/src/app/app.config.ts`, `frontend/src/app/core/auth/auth.interceptor.ts`, `frontend/src/app/core/interceptors/city.interceptor.ts`

- [ ] **Step 1: Write the failing specs**

Replace `frontend/src/app/app.spec.ts` with:
```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  it('renders the routed layout through a router outlet', async () => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeTruthy();
  });
});
```
Create `frontend/src/app/core/operator/operator.store.spec.ts`:
```typescript
import { OperatorStore } from './operator.store';

const OPERATOR = { id: 3, username: 'op', first_name: 'Ali', role: 'city_admin', city: 1, city_name: 'Guliston' };

describe('OperatorStore', () => {
  beforeEach(() => localStorage.clear());

  it('starts signed out and persists the session', () => {
    const store = new OperatorStore();
    expect(store.isOperator()).toBe(false);
    store.set({ access: 'a', refresh: 'r', user: OPERATOR });
    expect(store.isOperator()).toBe(true);
    const restored = new OperatorStore();
    expect(restored.access()).toBe('a');
    expect(restored.operator()?.city_name).toBe('Guliston');
  });

  it('exposes a city header only for a global operator', () => {
    const store = new OperatorStore();
    store.set({ access: 'a', refresh: 'r', user: OPERATOR });
    expect(store.headerCityId()).toBeNull();
    store.set({ access: 'a', refresh: 'r', user: { ...OPERATOR, role: 'superadmin', city: null, city_name: '' } });
    expect(store.headerCityId()).toBeNull();
    store.selectCity(7);
    expect(store.headerCityId()).toBe(7);
  });

  it('clears everything on sign out and ignores corrupt storage', () => {
    const store = new OperatorStore();
    store.set({ access: 'a', refresh: 'r', user: OPERATOR });
    store.signOut();
    expect(store.isOperator()).toBe(false);
    expect(localStorage.getItem('tezxarid.operator')).toBeNull();
    localStorage.setItem('tezxarid.operator', '{nope');
    expect(new OperatorStore().isOperator()).toBe(false);
  });
});
```
Create `frontend/src/app/core/operator/operator.guard.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { operatorGuard } from './operator.guard';
import { OperatorStore } from './operator.store';

describe('operatorGuard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  it('sends a signed-out visitor to the login page', () => {
    const result = TestBed.runInInjectionContext(() => operatorGuard());
    expect(result).toEqual(TestBed.inject(Router).parseUrl('/order-admin/login'));
  });

  it('lets a signed-in operator through', () => {
    TestBed.inject(OperatorStore).set({ access: 'a', refresh: 'r',
      user: { id: 1, username: 'op', first_name: '', role: 'city_admin', city: 1, city_name: 'Guliston' } });
    expect(TestBed.runInInjectionContext(() => operatorGuard())).toBe(true);
  });
});
```
Create `frontend/src/app/core/operator/operator.interceptor.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { operatorInterceptor } from './operator.interceptor';
import { OperatorStore } from './operator.store';

const API = 'http://localhost:8000/api';
const OPERATOR = { id: 1, username: 'op', first_name: '', role: 'city_admin', city: 1, city_name: 'Guliston' };

describe('operatorInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let store: OperatorStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([operatorInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    store = TestBed.inject(OperatorStore);
  });

  it('leaves customer calls alone and signs operator calls', () => {
    store.set({ access: 'a', refresh: 'r', user: OPERATOR });
    http.get(`${API}/products/`).subscribe();
    expect(ctrl.expectOne(`${API}/products/`).request.headers.has('Authorization')).toBe(false);
    http.get(`${API}/operator/orders/`).subscribe();
    const req = ctrl.expectOne(`${API}/operator/orders/`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer a');
    expect(req.request.headers.has('X-City-Id')).toBe(false);
  });

  it('sends the picked city for a global operator', () => {
    store.set({ access: 'a', refresh: 'r', user: { ...OPERATOR, role: 'superadmin', city: null, city_name: '' } });
    store.selectCity(4);
    http.get(`${API}/operator/orders/`).subscribe();
    expect(ctrl.expectOne(`${API}/operator/orders/`).request.headers.get('X-City-Id')).toBe('4');
  });

  it('refreshes once on 401 and retries', () => {
    store.set({ access: 'old', refresh: 'r', user: OPERATOR });
    let body: unknown;
    http.get(`${API}/operator/orders/`).subscribe((b) => (body = b));
    ctrl.expectOne(`${API}/operator/orders/`).flush({}, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne(`${API}/auth/token/refresh/`).flush({ access: 'new' });
    const retry = ctrl.expectOne(`${API}/operator/orders/`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer new');
    retry.flush([{ id: 1 }]);
    expect(body).toEqual([{ id: 1 }]);
    ctrl.verify();
  });

  it('signs the operator out when the refresh fails', () => {
    store.set({ access: 'old', refresh: 'r', user: OPERATOR });
    let status = 0;
    http.get(`${API}/operator/orders/`).subscribe({ error: (e) => (status = e.status) });
    ctrl.expectOne(`${API}/operator/orders/`).flush({}, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne(`${API}/auth/token/refresh/`).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(status).toBe(401);
    expect(store.isOperator()).toBe(false);
    ctrl.verify();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

`npx ng test --watch=false --include="src/app/core/operator/*.spec.ts" --include="src/app/app.spec.ts"` → FAIL (modules not found).

- [ ] **Step 3: Models and store**

Create `frontend/src/app/core/api/models/operator.models.ts`:
```typescript
export interface OperatorUser {
  id: number;
  username: string;
  first_name: string;
  role: string;
  city: number | null;
  city_name: string;
}

export interface OperatorSession {
  access: string;
  refresh: string;
  user: OperatorUser;
}

export interface OperatorStage {
  id: number;
  code: string;
  name: string;
  sort_order: number;
  is_initial: boolean;
  is_final: boolean;
  is_canceled: boolean;
}

export interface OperatorOrderRow {
  id: number;
  customer_name: string;
  phone: string;
  address: string;
  total: string;
  stage: string;
  stage_name: string;
  delivery_date: string | null;
  delivery_window: string;
  items_count: number;
  created_at: string;
  user: number | null;
}

export interface OperatorOrderPage {
  count: number;
  counts: Record<string, number>;
  results: OperatorOrderRow[];
}

export interface OperatorOrderItem {
  id: number;
  city_product: number;
  name: string;
  unit: string;
  step: string;
  qty: string;
  price_snapshot: string;
  line_total: string;
}

export interface OperatorEvent {
  id: number;
  kind: string;
  actor_name: string;
  from_stage_name: string;
  to_stage_name: string;
  note: string;
  created_at: string;
}

export interface OperatorOrder {
  id: number;
  city: number;
  user: number | null;
  customer_name: string;
  phone: string;
  address: string;
  latitude: string | null;
  longitude: string | null;
  comment: string;
  payment_type: string;
  total: string;
  stage: string;
  stage_id: number | null;
  stage_name: string;
  is_terminal: boolean;
  delivery_date: string | null;
  delivery_start: string | null;
  delivery_end: string | null;
  delivery_window: string;
  delivery_slot: number | null;
  created_at: string;
  updated_at: string;
  items: OperatorOrderItem[];
  events: OperatorEvent[];
}

export interface OperatorOrderPatch {
  customer_name?: string;
  phone?: string;
  address?: string;
  comment?: string;
  payment_type?: string;
  delivery_date?: string | null;
  delivery_slot_id?: number | null;
}

export interface OperatorProduct {
  city_product_id: number;
  name: string;
  unit: string;
  step: string;
  price: string;
}

export interface OperatorCustomerRow {
  id: number;
  name: string;
  username: string;
  phone: string;
  telegram_id: number | null;
  date_joined: string;
  orders_count: number;
  orders_total: string;
  last_order_at: string | null;
}

export interface OperatorCustomer extends OperatorCustomerRow {
  addresses: { id: number; title: string; address: string; is_default: boolean }[];
  orders: OperatorOrder[];
}
```
Create `frontend/src/app/core/operator/operator.store.ts`:
```typescript
import { Injectable, computed, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { OperatorSession, OperatorUser } from '../api/models/operator.models';

const STORAGE_KEY = 'tezxarid.operator';
const GLOBAL_ROLES = new Set(['superadmin']);

/** The operator console's own session, kept apart from the customer's Telegram session. */
@Injectable({ providedIn: 'root' })
export class OperatorStore {
  readonly access = signal<string | null>(null);
  readonly refresh = signal<string | null>(null);
  readonly operator = signal<OperatorUser | null>(null);
  readonly isOperator = computed(() => this.access() !== null && this.operator() !== null);
  readonly isGlobal = computed(() => GLOBAL_ROLES.has(this.operator()?.role ?? ''));
  /** City chosen by a global operator; a city operator is pinned server-side. */
  readonly pickedCity = signal<number | null>(null);
  /** The in-flight refresh shared by concurrent 401s (owned by operatorInterceptor). */
  refreshing: Observable<string> | null = null;

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as OperatorSession | null;
      if (saved?.access && saved?.refresh && saved?.user) {
        this.access.set(saved.access);
        this.refresh.set(saved.refresh);
        this.operator.set(saved.user);
      }
    } catch { /* corrupt storage → signed out */ }
  }

  set(session: OperatorSession): void {
    this.access.set(session.access);
    this.refresh.set(session.refresh);
    this.operator.set(session.user);
    this.pickedCity.set(null);
    this.persist();
  }

  setAccess(access: string): void {
    this.access.set(access);
    this.persist();
  }

  selectCity(cityId: number | null): void {
    this.pickedCity.set(cityId);
  }

  /** The X-City-Id an operator request should carry, or null when the server decides. */
  headerCityId(): number | null {
    return this.isGlobal() ? this.pickedCity() : null;
  }

  signOut(): void {
    this.access.set(null);
    this.refresh.set(null);
    this.operator.set(null);
    this.pickedCity.set(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(
        { access: this.access(), refresh: this.refresh(), user: this.operator() }));
    } catch { /* storage blocked — session lives in memory */ }
  }
}
```

- [ ] **Step 4: Guard and interceptor**

Create `frontend/src/app/core/operator/operator.guard.ts`:
```typescript
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { OperatorStore } from './operator.store';

/** The console is on the public site: without an operator session, go to its login page. */
export const operatorGuard: CanActivateFn = () =>
  inject(OperatorStore).isOperator() ? true : inject(Router).parseUrl('/order-admin/login');
```
Create `frontend/src/app/core/operator/operator.interceptor.ts`:
```typescript
import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, finalize, map, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { AuthApi } from '../api/auth-api';
import { OperatorStore } from './operator.store';

const OPERATOR_PREFIX = '/api/operator/';

function sign<T>(req: HttpRequest<T>, token: string | null, cityId: number | null): HttpRequest<T> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (cityId != null) headers['X-City-Id'] = String(cityId);
  return Object.keys(headers).length ? req.clone({ setHeaders: headers }) : req;
}

/** Signs /api/operator/ calls with the operator token and refreshes it once on 401. */
export const operatorInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.includes(OPERATOR_PREFIX)) return next(req);
  const store = inject(OperatorStore);
  const api = inject(AuthApi);

  return next(sign(req, store.access(), store.headerCityId())).pipe(
    catchError((err: HttpErrorResponse) => {
      const refresh = store.refresh();
      if (err.status !== 401 || !refresh) return throwError(() => err);
      store.refreshing ??= api.refresh(refresh).pipe(
        map((r) => r.access),
        tap((access) => store.setAccess(access)),
        catchError((e) => { store.signOut(); return throwError(() => e); }),
        finalize(() => { store.refreshing = null; }),
        shareReplay(1),
      );
      return store.refreshing.pipe(
        catchError(() => throwError(() => err)),
        switchMap((access) => next(sign(req, access, store.headerCityId()))),
      );
    }),
  );
};
```
Make the customer interceptors skip operator calls. In `frontend/src/app/core/auth/auth.interceptor.ts` change the first line of the function to:
```typescript
  if (req.url.includes('/api/operator/') || AUTH_PATHS.some((p) => req.url.includes(p))) return next(req);
```
In `frontend/src/app/core/interceptors/city.interceptor.ts`:
```typescript
export const cityInterceptor: HttpInterceptorFn = (req, next) => {
  // Operator calls carry their own city (the server pins it to the operator's account).
  if (req.url.includes('/api/operator/')) return next(req);
  const cityId = inject(CityService).cityId;
  if (cityId != null) {
    return next(req.clone({ setHeaders: { 'X-City-Id': String(cityId) } }));
  }
  return next(req);
};
```
In `frontend/src/app/app.config.ts` add `operatorInterceptor` **first** in the chain (outermost on the request path, so it can sign before anything else) and import it:
```typescript
      withInterceptors([operatorInterceptor, cityInterceptor, errorInterceptor, authInterceptor]),
```

- [ ] **Step 5: Split the router into two layouts**

Replace `frontend/src/app/app.ts` with:
```typescript
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class App {}
```
Replace `frontend/src/app/app.routes.ts` with:
```typescript
import { Routes } from '@angular/router';
import { Shell } from './layout/shell/shell';
import { cartNotEmptyGuard } from './core/guards/cart-not-empty.guard';
import { orderExistsGuard } from './core/guards/order-exists.guard';
import { operatorGuard } from './core/operator/operator.guard';

export const routes: Routes = [
  // Operator console: its own shell, its own session. Listed first so '' does not swallow it.
  { path: 'order-admin/login', loadComponent: () => import('./features/order-admin/admin-login').then((m) => m.AdminLogin) },
  {
    path: 'order-admin',
    canActivate: [operatorGuard],
    loadComponent: () => import('./layout/admin-shell/admin-shell').then((m) => m.AdminShell),
    children: [
      { path: '', loadComponent: () => import('./features/order-admin/orders-board').then((m) => m.OrdersBoard) },
      { path: 'orders/:id', loadComponent: () => import('./features/order-admin/order-detail').then((m) => m.OrderDetail) },
      { path: 'customers', loadComponent: () => import('./features/order-admin/customers').then((m) => m.Customers) },
      { path: 'customers/:id', loadComponent: () => import('./features/order-admin/customer-detail').then((m) => m.CustomerDetail) },
    ],
  },
  {
    path: '',
    component: Shell,
    children: [
      { path: '', loadComponent: () => import('./features/home/home').then((m) => m.Home) },
      { path: 'category/:id', loadComponent: () => import('./features/category/category').then((m) => m.Category) },
      { path: 'cart', loadComponent: () => import('./features/cart/cart-page').then((m) => m.CartPage) },
      { path: 'search', loadComponent: () => import('./features/search/search').then((m) => m.Search) },
      { path: 'orders', loadComponent: () => import('./features/orders/orders').then((m) => m.Orders) },
      { path: 'profile', loadComponent: () => import('./features/profile/profile').then((m) => m.Profile) },
      // Most specific first (stylistic: a leaf route never matches leftover URL segments anyway).
      { path: 'checkout/success', canActivate: [orderExistsGuard], loadComponent: () => import('./features/checkout/order-success').then((m) => m.OrderSuccess) },
      { path: 'checkout', canActivate: [cartNotEmptyGuard], loadComponent: () => import('./features/checkout/checkout').then((m) => m.Checkout) },
    ],
  },
  { path: '**', redirectTo: '' },
];
```
The four order-admin components and `AdminShell` do not exist yet, so `app.routes.ts` will not compile until Task 7. Leave the four child routes and the `loadComponent` for `AdminShell` **commented out** in this task, with the comment `// Task 7 adds the console components`, and uncomment them in Task 7. Keep `order-admin/login` commented too.

- [ ] **Step 6: Run the full suite**

`npx ng test --watch=false` → **175 passed** (166 baseline + 1 app + 3 store + 2 guard + 4 interceptor... adjust the expected number to what the run reports; every previously passing spec must still pass, especially `shell.spec.ts`, `app.config.spec.ts` and the back-button specs that navigate).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/app.ts frontend/src/app/app.spec.ts frontend/src/app/app.routes.ts frontend/src/app/app.config.ts frontend/src/app/core/operator frontend/src/app/core/api/models/operator.models.ts frontend/src/app/core/auth/auth.interceptor.ts frontend/src/app/core/interceptors/city.interceptor.ts
git commit -m "feat(frontend): router split into customer and operator layouts; operator session store, guard and interceptor"
```

---

## Task 7: Frontend — operator API client, login page, console shell

**Files:**
- Create: `frontend/src/app/core/api/operator-api.ts` (+spec), `frontend/src/app/features/order-admin/admin-login.ts` (+spec), `frontend/src/app/layout/admin-shell/admin-shell.ts` (+spec)
- Modify: `frontend/src/app/app.routes.ts` (uncomment the console routes)

- [ ] **Step 1: Write the failing specs**

Create `frontend/src/app/core/api/operator-api.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { OperatorApi } from './operator-api';

const BASE = 'http://localhost:8000/api';

describe('OperatorApi', () => {
  let api: OperatorApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(OperatorApi);
    http = TestBed.inject(HttpTestingController);
  });

  it('calls every operator endpoint with the right method and url', () => {
    api.login('op', 'secret').subscribe();
    const login = http.expectOne(`${BASE}/auth/login/`);
    expect(login.request.method).toBe('POST');
    expect(login.request.body).toEqual({ username: 'op', password: 'secret' });

    api.stages().subscribe();
    expect(http.expectOne(`${BASE}/operator/stages/`).request.method).toBe('GET');

    api.orders({ stage: 'new', q: 'ali', date: '2026-09-21' }).subscribe();
    const list = http.expectOne((r) => r.url === `${BASE}/operator/orders/`);
    expect(list.request.params.get('stage')).toBe('new');
    expect(list.request.params.get('q')).toBe('ali');
    expect(list.request.params.get('date')).toBe('2026-09-21');

    api.order(5).subscribe();
    expect(http.expectOne(`${BASE}/operator/orders/5/`).request.method).toBe('GET');

    api.patchOrder(5, { comment: 'tez' }).subscribe();
    const patch = http.expectOne(`${BASE}/operator/orders/5/`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ comment: 'tez' });

    api.replaceItems(5, [{ city_product: 2, qty: '1.000' }]).subscribe();
    const items = http.expectOne(`${BASE}/operator/orders/5/items/`);
    expect(items.request.method).toBe('PUT');
    expect(items.request.body).toEqual({ items: [{ city_product: 2, qty: '1.000' }] });

    api.moveStage(5, 'accepted', 'ok').subscribe();
    expect(http.expectOne(`${BASE}/operator/orders/5/stage/`).request.body).toEqual({ stage: 'accepted', note: 'ok' });

    api.logEvent(5, 'called').subscribe();
    expect(http.expectOne(`${BASE}/operator/orders/5/events/`).request.body).toEqual({ kind: 'called', note: '' });

    api.products('ol').subscribe();
    expect(http.expectOne((r) => r.url === `${BASE}/operator/products/`).request.params.get('search')).toBe('ol');

    api.customers('ali').subscribe();
    expect(http.expectOne((r) => r.url === `${BASE}/operator/customers/`).request.params.get('q')).toBe('ali');

    api.customer(9).subscribe();
    expect(http.expectOne(`${BASE}/operator/customers/9/`).request.method).toBe('GET');
    http.verify();
  });
});
```
Create `frontend/src/app/features/order-admin/admin-login.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { AdminLogin } from './admin-login';
import { OperatorStore } from '../../core/operator/operator.store';

const SESSION = { access: 'a', refresh: 'r',
  user: { id: 1, username: 'op', first_name: 'Ali', role: 'city_admin', city: 1, city_name: 'Guliston' } };

describe('AdminLogin', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [AdminLogin],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('signs in and goes to the board', async () => {
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(AdminLogin);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    c.form.setValue({ username: 'op', password: 'secret' });
    c.submit();
    http.expectOne((r) => r.url.endsWith('/auth/login/')).flush(SESSION);
    await fixture.whenStable();
    expect(TestBed.inject(OperatorStore).isOperator()).toBe(true);
    expect(nav).toHaveBeenCalledWith('/order-admin');
  });

  it('shows the server message when the credentials are wrong', async () => {
    const fixture = TestBed.createComponent(AdminLogin);
    fixture.detectChanges();
    fixture.componentInstance.form.setValue({ username: 'op', password: 'bad' });
    fixture.componentInstance.submit();
    http.expectOne((r) => r.url.endsWith('/auth/login/'))
      .flush({ detail: "Login yoki parol noto'g'ri." }, { status: 400, statusText: 'Bad Request' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Login yoki parol noto'g'ri");
    expect(TestBed.inject(OperatorStore).isOperator()).toBe(false);
  });
});
```
Create `frontend/src/app/layout/admin-shell/admin-shell.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { AdminShell } from './admin-shell';
import { OperatorStore } from '../../core/operator/operator.store';

describe('AdminShell', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [AdminShell],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    TestBed.inject(OperatorStore).set({ access: 'a', refresh: 'r',
      user: { id: 1, username: 'op', first_name: 'Ali', role: 'city_admin', city: 1, city_name: 'Guliston' } });
  });

  it('shows the operator, the city and the console links', async () => {
    const fixture = TestBed.createComponent(AdminShell);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Guliston');
    expect(text).toContain('Ali');
    expect(text).toContain('Buyurtmalar');
    expect(text).toContain('Mijozlar');
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeTruthy();
  });

  it('signs out and returns to the login page', async () => {
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(AdminShell);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('button.out') as HTMLButtonElement).click();
    expect(TestBed.inject(OperatorStore).isOperator()).toBe(false);
    expect(nav).toHaveBeenCalledWith('/order-admin/login');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

`npx ng test --watch=false --include="src/app/core/api/operator-api.spec.ts" --include="src/app/features/order-admin/*.spec.ts" --include="src/app/layout/admin-shell/*.spec.ts"` → FAIL (modules not found).

- [ ] **Step 3: API client**

Create `frontend/src/app/core/api/operator-api.ts`:
```typescript
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  OperatorCustomer, OperatorCustomerRow, OperatorEvent, OperatorOrder, OperatorOrderPage,
  OperatorOrderPatch, OperatorProduct, OperatorSession, OperatorStage,
} from './models/operator.models';

export interface OrderQuery { stage?: string; q?: string; date?: string; limit?: number; offset?: number; }

@Injectable({ providedIn: 'root' })
export class OperatorApi {
  private http = inject(HttpClient);
  private base = environment.apiUrl;
  private ops = `${environment.apiUrl}/operator`;

  login(username: string, password: string): Observable<OperatorSession> {
    return this.http.post<OperatorSession>(`${this.base}/auth/login/`, { username, password });
  }

  stages(): Observable<OperatorStage[]> {
    return this.http.get<OperatorStage[]>(`${this.ops}/stages/`);
  }

  orders(query: OrderQuery = {}): Observable<OperatorOrderPage> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<OperatorOrderPage>(`${this.ops}/orders/`, { params });
  }

  order(id: number): Observable<OperatorOrder> {
    return this.http.get<OperatorOrder>(`${this.ops}/orders/${id}/`);
  }

  patchOrder(id: number, patch: OperatorOrderPatch): Observable<OperatorOrder> {
    return this.http.patch<OperatorOrder>(`${this.ops}/orders/${id}/`, patch);
  }

  replaceItems(id: number, items: { city_product: number; qty: string }[]): Observable<OperatorOrder> {
    return this.http.put<OperatorOrder>(`${this.ops}/orders/${id}/items/`, { items });
  }

  moveStage(id: number, stage: string, note = ''): Observable<OperatorOrder> {
    return this.http.post<OperatorOrder>(`${this.ops}/orders/${id}/stage/`, { stage, note });
  }

  logEvent(id: number, kind: 'called' | 'printed', note = ''): Observable<OperatorEvent> {
    return this.http.post<OperatorEvent>(`${this.ops}/orders/${id}/events/`, { kind, note });
  }

  products(search: string): Observable<OperatorProduct[]> {
    return this.http.get<OperatorProduct[]>(`${this.ops}/products/`, { params: new HttpParams().set('search', search) });
  }

  customers(q = ''): Observable<{ count: number; results: OperatorCustomerRow[] }> {
    return this.http.get<{ count: number; results: OperatorCustomerRow[] }>(
      `${this.ops}/customers/`, { params: new HttpParams().set('q', q) });
  }

  customer(id: number): Observable<OperatorCustomer> {
    return this.http.get<OperatorCustomer>(`${this.ops}/customers/${id}/`);
  }
}
```

- [ ] **Step 4: Login page**

Create `frontend/src/app/features/order-admin/admin-login.ts`:
```typescript
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { OperatorApi } from '../../core/api/operator-api';
import { OperatorStore } from '../../core/operator/operator.store';

/** Username + password sign-in for the city operator console. */
@Component({
  selector: 'tx-admin-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="wrap">
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <h1>Operator kirishi</h1>
        <label><span>Login</span><input formControlName="username" autocomplete="username" autocapitalize="off" /></label>
        <label><span>Parol</span><input type="password" formControlName="password" autocomplete="current-password" /></label>
        @if (error(); as msg) { <p class="err" role="alert">{{ msg }}</p> }
        <button type="submit" [disabled]="busy() || form.invalid">{{ busy() ? 'Tekshirilmoqda…' : 'Kirish' }}</button>
      </form>
    </div>
  `,
  styles: [`
    .wrap { min-height: 100vh; display: grid; place-items: center; background: #f5f5f5; padding: 1rem; }
    form { width: 100%; max-width: 22rem; background: #fff; border-radius: 16px; padding: 1.5rem; display: grid; gap: .75rem; }
    h1 { margin: 0 0 .5rem; font-size: 1.2rem; text-align: center; }
    label { display: grid; gap: .3rem; }
    label span { font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; color: #6b6b6b; }
    input { border: none; border-radius: 12px; background: #f3f3f3; padding: .85rem; font: inherit; }
    input:focus-visible { outline: 2px solid #F60; outline-offset: 2px; }
    button { border: none; border-radius: 12px; background: #F60; color: #fff; font: inherit; font-weight: 700; padding: .9rem; cursor: pointer; }
    button:disabled { background: #e6e6e6; color: #6b6b6b; cursor: default; }
    .err { margin: 0; color: #b42318; font-size: .9rem; }
  `],
})
export class AdminLogin {
  private api = inject(OperatorApi);
  private store = inject(OperatorStore);
  private router = inject(Router);

  form = inject(FormBuilder).nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });
  busy = signal(false);
  error = signal<string | null>(null);

  submit(): void {
    if (this.form.invalid || this.busy()) return;
    const { username, password } = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    this.api.login(username, password).subscribe({
      next: (session) => {
        this.store.set(session);
        this.busy.set(false);
        void this.router.navigateByUrl('/order-admin');
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(err.error?.detail ?? "Kirishda xatolik. Qayta urinib ko'ring.");
        this.busy.set(false);
      },
    });
  }
}
```

- [ ] **Step 5: Console shell**

Create `frontend/src/app/layout/admin-shell/admin-shell.ts`:
```typescript
import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { OperatorStore } from '../../core/operator/operator.store';

/** Chrome for the operator console: no customer nav, no cart, no back button. */
@Component({
  selector: 'tx-admin-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="bar">
      <div class="who">
        <b>{{ store.operator()?.city_name || 'Operator' }}</b>
        <small>{{ store.operator()?.first_name || store.operator()?.username }}</small>
      </div>
      <nav>
        <a routerLink="/order-admin" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }">Buyurtmalar</a>
        <a routerLink="/order-admin/customers" routerLinkActive="on">Mijozlar</a>
      </nav>
      <button type="button" class="out" (click)="signOut()">Chiqish</button>
    </header>
    <main><router-outlet /></main>
  `,
  styles: [`
    :host { display: block; background: #f5f5f5; min-height: 100vh; }
    .bar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 1rem;
      background: #1f2430; color: #fff; padding: .6rem 1rem; }
    .who { display: grid; line-height: 1.2; }
    .who small { color: #b9c0cc; font-size: .75rem; }
    nav { display: flex; gap: .25rem; margin-left: auto; }
    nav a { color: #d7dbe3; text-decoration: none; padding: .4rem .8rem; border-radius: 999px; font-size: .9rem; }
    nav a.on { background: #F60; color: #fff; font-weight: 700; }
    .out { border: none; background: #2c3342; color: #d7dbe3; border-radius: 999px; padding: .4rem .9rem;
      font: inherit; font-size: .85rem; cursor: pointer; }
    main { padding-bottom: 2rem; }
    @media print { .bar { display: none; } }
  `],
})
export class AdminShell {
  store = inject(OperatorStore);
  private router = inject(Router);

  signOut(): void {
    this.store.signOut();
    void this.router.navigateByUrl('/order-admin/login');
  }
}
```
Now uncomment the console routes in `frontend/src/app/app.routes.ts` (the login route, the `AdminShell` `loadComponent` and its four children). The board, detail, customers and customer-detail components arrive in Tasks 8, 9 and 12, so keep **only** the `''` child pointing at `orders-board` commented until Task 8 and add the rest as each task lands. Simplest: in this task enable the login route and the shell with an empty `children: []`, then each later task appends its own child route.

- [ ] **Step 6: Run the full suite**

`npx ng test --watch=false` → all green, 5 new tests over Task 6's count.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/core/api/operator-api.ts frontend/src/app/core/api/operator-api.spec.ts frontend/src/app/features/order-admin frontend/src/app/layout/admin-shell frontend/src/app/app.routes.ts
git commit -m "feat(frontend): operator API client, console login page and admin shell"
```

---

## Task 8: Frontend — orders board with stage tabs, filters, polling and alert

**Files:**
- Create: `frontend/src/app/shared/utils/beep.ts`, `frontend/src/app/features/order-admin/orders-board.ts` (+spec)
- Modify: `frontend/src/app/app.routes.ts`

- [ ] **Step 1: Write the failing spec**

Create `frontend/src/app/features/order-admin/orders-board.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { OrdersBoard } from './orders-board';

const STAGES = [
  { id: 1, code: 'new', name: 'Yangi', sort_order: 10, is_initial: true, is_final: false, is_canceled: false },
  { id: 2, code: 'accepted', name: 'Tasdiqlandi', sort_order: 20, is_initial: false, is_final: false, is_canceled: false },
];
const row = (id: number, stage = 'new') => ({
  id, customer_name: 'Aziz', phone: '+998901234567', address: 'Chilonzor 5', total: '19300.00',
  stage, stage_name: stage === 'new' ? 'Yangi' : 'Tasdiqlandi', delivery_date: '2026-09-21',
  delivery_window: '09:00 – 12:00', items_count: 2, created_at: '2026-09-20T10:00:00+05:00', user: null,
});
const page = (rows: ReturnType<typeof row>[]) => ({ count: rows.length, counts: { new: 1, accepted: 0 }, results: rows });

describe('OrdersBoard', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [OrdersBoard],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  async function create() {
    const fixture = TestBed.createComponent(OrdersBoard);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/operator/stages/')).flush(STAGES);
    http.expectOne((r) => r.url.endsWith('/operator/orders/')).flush(page([row(7)]));
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    return fixture;
  }

  it('lists the city orders with stage tabs and counters', async () => {
    const fixture = await create();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Yangi');
    expect(text).toContain('№ 7');
    expect(text).toContain('Aziz');
    expect(text).toContain("19 300 so'm");
    expect(fixture.nativeElement.querySelectorAll('.tabs button').length).toBe(3); // Hammasi + two stages
  });

  it('filters by stage through the query', async () => {
    const fixture = await create();
    (fixture.nativeElement.querySelectorAll('.tabs button')[2] as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(0);
    const req = http.expectOne((r) => r.url.endsWith('/operator/orders/') && r.params.get('stage') === 'accepted');
    req.flush(page([]));
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Buyurtma topilmadi');
  });

  it('polls every 15 seconds and alerts on a newly arrived order', async () => {
    const fixture = await create();
    const beep = vi.spyOn(fixture.componentInstance, 'alert').mockImplementation(() => {});
    await vi.advanceTimersByTimeAsync(15_000);
    http.expectOne((r) => r.url.endsWith('/operator/orders/')).flush(page([row(9), row(7)]));
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(beep).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.textContent).toContain('№ 9');
  });

  it('keeps the list when a poll fails', async () => {
    const fixture = await create();
    await vi.advanceTimersByTimeAsync(15_000);
    http.expectOne((r) => r.url.endsWith('/operator/orders/')).flush('boom', { status: 500, statusText: 'Server Error' });
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('№ 7');
    expect(fixture.nativeElement.textContent).toContain('yangilanmadi');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

`npx ng test --watch=false --include="src/app/features/order-admin/orders-board.spec.ts"` → FAIL (module not found).

- [ ] **Step 3: The alert sound**

Create `frontend/src/app/shared/utils/beep.ts`:
```typescript
/** Short attention tone for a newly arrived order. Silent when audio is unavailable or blocked. */
export function beep(): void {
  try {
    const Ctor = (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.06;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => void ctx.close();
  } catch {
    // Autoplay policy or a headless environment: the visual counter is enough.
  }
}
```

- [ ] **Step 4: The board**

Create `frontend/src/app/features/order-admin/orders-board.ts`:
```typescript
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { EMPTY, catchError, combineLatest, debounceTime, interval, map, startWith, switchMap } from 'rxjs';
import { OperatorApi } from '../../core/api/operator-api';
import { OperatorOrderRow, OperatorStage } from '../../core/api/models/operator.models';
import { SumPipe } from '../../shared/pipes/sum.pipe';
import { beep } from '../../shared/utils/beep';

const POLL_MS = 15_000;

/** The operator's working list: stage tabs, search, date filter and a self-refreshing table. */
@Component({
  selector: 'tx-orders-board',
  standalone: true,
  imports: [RouterLink, SumPipe],
  template: `
    <div class="page">
      <div class="tabs">
        <button type="button" [class.on]="stage() === ''" (click)="stage.set('')">Hammasi</button>
        @for (s of stages(); track s.id) {
          <button type="button" [class.on]="stage() === s.code" (click)="stage.set(s.code)">
            {{ s.name }} <span class="n">{{ counts()[s.code] ?? 0 }}</span>
          </button>
        }
      </div>

      <div class="filters">
        <input #q type="search" placeholder="Raqam, ism yoki telefon" aria-label="Qidiruv"
          [value]="query()" (input)="query.set(q.value)" />
        <input #d type="date" aria-label="Yetkazish sanasi" [value]="date()" (change)="date.set(d.value)" />
        <button type="button" class="ghost" (click)="refresh()">Yangilash</button>
      </div>

      @if (stale()) { <p class="stale" role="status">Ro'yxat yangilanmadi, qayta urinilmoqda…</p> }

      <div class="rows">
        @for (o of orders(); track o.id) {
          <a class="row" [routerLink]="['/order-admin/orders', o.id]">
            <div class="id">№ {{ o.id }}<small>{{ o.created_at | date: 'HH:mm' }}</small></div>
            <div class="who"><b>{{ o.customer_name }}</b><small>{{ o.phone }}</small></div>
            <div class="when">{{ o.delivery_date }}<small>{{ o.delivery_window }}</small></div>
            <div class="sum">{{ o.total | sum }}<small>{{ o.items_count }} ta</small></div>
            <div class="stage">{{ o.stage_name }}</div>
          </a>
        } @empty {
          <p class="empty">Buyurtma topilmadi</p>
        }
      </div>
    </div>
  `,
  styles: [`
    .page { max-width: 60rem; margin: 0 auto; padding: 1rem; }
    .tabs { display: flex; flex-wrap: wrap; gap: .4rem; margin-bottom: .75rem; }
    .tabs button { border: none; background: #fff; border-radius: 999px; padding: .45rem .9rem; font: inherit;
      font-size: .9rem; cursor: pointer; }
    .tabs button.on { background: #F60; color: #fff; font-weight: 700; }
    .n { opacity: .75; font-size: .8em; margin-left: .25rem; }
    .filters { display: flex; gap: .5rem; margin-bottom: .75rem; flex-wrap: wrap; }
    .filters input { border: none; border-radius: 12px; padding: .6rem .8rem; font: inherit; background: #fff; flex: 1 1 10rem; }
    .ghost { border: 1px solid #d5d5d5; background: #fff; border-radius: 12px; padding: .6rem 1rem; font: inherit; cursor: pointer; }
    .stale { color: #7a4b00; background: #fff8e6; border-radius: 10px; padding: .5rem .75rem; margin: 0 0 .5rem; }
    .rows { display: grid; gap: .5rem; }
    .row { display: grid; grid-template-columns: 6rem 1fr 8rem 8rem 8rem; gap: .75rem; align-items: center;
      background: #fff; border-radius: 12px; padding: .75rem 1rem; text-decoration: none; color: #1a1a1a; }
    .row small { display: block; color: #6b6b6b; font-size: .78rem; }
    .sum { font-weight: 700; text-align: right; }
    .stage { text-align: right; color: #444; font-size: .9rem; }
    .empty { text-align: center; color: #767676; padding: 2rem; }
    @media (max-width: 720px) { .row { grid-template-columns: 5rem 1fr auto; } .when, .stage { display: none; } }
  `],
})
export class OrdersBoard {
  private api = inject(OperatorApi);

  stages = signal<OperatorStage[]>([]);
  orders = signal<OperatorOrderRow[]>([]);
  counts = signal<Record<string, number>>({});
  stale = signal(false);
  stage = signal('');
  query = signal('');
  date = signal('');
  private tick = signal(0);
  private highestSeen = -1;

  private filters = computed(() => ({ stage: this.stage(), q: this.query().trim(), date: this.date(), tick: this.tick() }));

  constructor() {
    this.api.stages().pipe(takeUntilDestroyed()).subscribe({
      next: (list) => {
        this.stages.set(list);
        const initial = list.find((s) => s.is_initial);
        if (initial) this.stage.set(initial.code);
      },
      error: () => this.stages.set([]),
    });

    combineLatest([
      toObservable(this.filters).pipe(debounceTime(250)),
      interval(POLL_MS).pipe(startWith(0)),
    ]).pipe(
      map(([filters]) => filters),
      switchMap((f) => this.api.orders({ stage: f.stage, q: f.q, date: f.date }).pipe(
        map((page) => ({ ok: true as const, page })),
        catchError(() => [{ ok: false as const, page: null }]),
      )),
      takeUntilDestroyed(),
    ).subscribe((result) => {
      if (!result.ok || !result.page) { this.stale.set(true); return; }
      this.stale.set(false);
      this.counts.set(result.page.counts);
      const rows = result.page.results;
      const highest = rows.reduce((max, row) => Math.max(max, row.id), -1);
      if (this.highestSeen >= 0 && highest > this.highestSeen) this.alert();
      this.highestSeen = Math.max(this.highestSeen, highest);
      this.orders.set(rows);
    });
  }

  /** Overridable in tests; plays a tone and flags the tab title. */
  alert(): void {
    beep();
    try { document.title = `(!) Yangi buyurtma · Tezxarid`; } catch { /* ignore */ }
  }

  refresh(): void {
    this.tick.update((n) => n + 1);
  }
}
```
Note the template uses Angular's `DatePipe`; add `DatePipe` to the component `imports` (`import { DatePipe } from '@angular/common'`).

Add the child route in `frontend/src/app/app.routes.ts` under `order-admin`:
```typescript
      { path: '', loadComponent: () => import('./features/order-admin/orders-board').then((m) => m.OrdersBoard) },
```

- [ ] **Step 5: Run the full suite**

`npx ng test --watch=false` → all green (4 new tests). If the polling spec sees an extra request because `combineLatest` fires for both sources, assert with `http.match` instead of `expectOne` and flush every match — report the change.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/order-admin frontend/src/app/shared/utils/beep.ts frontend/src/app/app.routes.ts
git commit -m "feat(frontend): operator orders board with stage tabs, filters, polling and new-order alert"
```

---

## Task 9: Frontend — order detail: customer and delivery editing, stage moves, events

**Files:**
- Create: `frontend/src/app/features/order-admin/order-detail.ts` (+spec)
- Modify: `frontend/src/app/app.routes.ts`

- [ ] **Step 1: Write the failing spec**

Create `frontend/src/app/features/order-admin/order-detail.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { OrderDetail } from './order-detail';

const STAGES = [
  { id: 1, code: 'new', name: 'Yangi', sort_order: 10, is_initial: true, is_final: false, is_canceled: false },
  { id: 2, code: 'accepted', name: 'Tasdiqlandi', sort_order: 20, is_initial: false, is_final: false, is_canceled: false },
  { id: 3, code: 'canceled', name: 'Bekor qilindi', sort_order: 60, is_initial: false, is_final: false, is_canceled: true },
];
const ORDER = {
  id: 7, city: 1, user: null, customer_name: 'Aziz', phone: '+998901234567', address: 'Chilonzor 5',
  latitude: null, longitude: null, comment: '', payment_type: 'cash', total: '19300.00',
  stage: 'new', stage_id: 1, stage_name: 'Yangi', is_terminal: false,
  delivery_date: '2026-09-21', delivery_start: '09:00', delivery_end: '12:00',
  delivery_window: '09:00 – 12:00', delivery_slot: 4,
  created_at: '2026-09-20T10:00:00+05:00', updated_at: '2026-09-20T10:00:00+05:00',
  items: [{ id: 1, city_product: 11, name: 'Olma', unit: 'kg', step: '0.500', qty: '1.000',
            price_snapshot: '19300.00', line_total: '19300.00' }],
  events: [],
};
const DAYS = [{ date: '2026-09-21', slots: [{ id: 4, start: '09:00', end: '12:00', available: true },
                                            { id: 5, start: '16:00', end: '19:00', available: true }] }];

describe('OrderDetail', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [OrderDetail],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '7' }) } } }],
    });
    http = TestBed.inject(HttpTestingController);
  });

  async function create(order = ORDER) {
    const fixture = TestBed.createComponent(OrderDetail);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/operator/orders/7/')).flush(order);
    http.expectOne((r) => r.url.endsWith('/operator/stages/')).flush(STAGES);
    http.expectOne((r) => r.url.endsWith('/delivery-slots/')).flush(DAYS);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('shows the order with a call link', async () => {
    const fixture = await create();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('№ 7');
    expect(text).toContain('Aziz');
    expect(text).toContain('Olma');
    expect(text).toContain("19 300 so'm");
    const call = fixture.nativeElement.querySelector('a.call') as HTMLAnchorElement;
    expect(call.getAttribute('href')).toBe('tel:+998901234567');
  });

  it('logs a call event when the operator taps the call link', async () => {
    const fixture = await create();
    (fixture.nativeElement.querySelector('a.call') as HTMLAnchorElement).click();
    const req = http.expectOne((r) => r.url.endsWith('/operator/orders/7/events/'));
    expect(req.request.body).toEqual({ kind: 'called', note: '' });
    req.flush({ id: 1, kind: 'called', actor_name: 'op', from_stage_name: '', to_stage_name: '', note: '', created_at: '' });
  });

  it('saves edited customer fields and the delivery slot', async () => {
    const fixture = await create();
    const c = fixture.componentInstance;
    c.form.patchValue({ customer_name: 'Aziz Karimov', comment: 'Eshik oldiga', delivery_slot_id: 5 });
    c.save();
    const req = http.expectOne((r) => r.url.endsWith('/operator/orders/7/') && r.method === 'PATCH');
    expect(req.request.body.customer_name).toBe('Aziz Karimov');
    expect(req.request.body.delivery_slot_id).toBe(5);
    req.flush({ ...ORDER, customer_name: 'Aziz Karimov', comment: 'Eshik oldiga' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Saqlandi');
  });

  it('confirms the order by moving it to the next stage', async () => {
    const fixture = await create();
    (fixture.nativeElement.querySelector('button.confirm') as HTMLButtonElement).click();
    const req = http.expectOne((r) => r.url.endsWith('/operator/orders/7/stage/'));
    expect(req.request.body).toEqual({ stage: 'accepted', note: '' });
    req.flush({ ...ORDER, stage: 'accepted', stage_name: 'Tasdiqlandi', stage_id: 2 });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Tasdiqlandi');
  });

  it('asks for a reason before cancelling', async () => {
    const fixture = await create();
    const c = fixture.componentInstance;
    c.cancelling.set(true);
    c.cancelNote.set('');
    c.cancel();
    http.expectNone((r) => r.url.endsWith('/operator/orders/7/stage/'));
    expect(c.error()).toContain('sabab');
    c.cancelNote.set('Mijoz rad etdi');
    c.cancel();
    const req = http.expectOne((r) => r.url.endsWith('/operator/orders/7/stage/'));
    expect(req.request.body).toEqual({ stage: 'canceled', note: 'Mijoz rad etdi' });
    req.flush({ ...ORDER, stage: 'canceled', stage_name: 'Bekor qilindi', is_terminal: true });
  });

  it('locks editing for a closed order', async () => {
    const fixture = await create({ ...ORDER, stage: 'canceled', stage_name: 'Bekor qilindi', is_terminal: true });
    expect(fixture.nativeElement.querySelector('button.confirm')).toBeNull();
    expect(fixture.componentInstance.form.disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

`npx ng test --watch=false --include="src/app/features/order-admin/order-detail.spec.ts"` → FAIL (module not found).

- [ ] **Step 3: Implement the detail page**

Create `frontend/src/app/features/order-admin/order-detail.ts`:
```typescript
import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { OperatorApi } from '../../core/api/operator-api';
import { OperatorOrder, OperatorStage } from '../../core/api/models/operator.models';
import { OrdersApi } from '../../core/api/orders-api';
import { DeliveryDay } from '../../core/api/models/order.models';
import { SumPipe } from '../../shared/pipes/sum.pipe';

/** One order, open in front of the operator while they are on the phone with the customer. */
@Component({
  selector: 'tx-order-detail',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, SumPipe, DatePipe],
  template: `
    @if (order(); as o) {
      <div class="page">
        <div class="top">
          <a routerLink="/order-admin" class="back">← Ro'yxat</a>
          <h1>№ {{ o.id }}</h1>
          <span class="stage">{{ o.stage_name }}</span>
        </div>

        @if (error(); as msg) { <p class="err" role="alert">{{ msg }}</p> }
        @if (saved()) { <p class="ok" role="status">Saqlandi</p> }

        <section class="card">
          <div class="callrow">
            <a class="call" [href]="'tel:' + o.phone" (click)="logCall()">📞 {{ o.phone }}</a>
            <button type="button" class="ghost" (click)="print()">Chekni chop etish</button>
          </div>
          <form [formGroup]="form" class="grid">
            <label><span>Mijoz</span><input formControlName="customer_name" maxlength="120" /></label>
            <label><span>Telefon</span><input formControlName="phone" maxlength="20" /></label>
            <label class="wide"><span>Manzil</span><input formControlName="address" maxlength="500" /></label>
            <label class="wide"><span>Izoh</span><input formControlName="comment" maxlength="500" /></label>
            <label><span>Yetkazish kuni</span>
              <select formControlName="delivery_date">
                @for (d of days(); track d.date) { <option [value]="d.date">{{ d.date }}</option> }
              </select>
            </label>
            <label><span>Vaqt oralig'i</span>
              <select formControlName="delivery_slot_id">
                @for (s of slotsForDay(); track s.id) { <option [value]="s.id">{{ s.start }} – {{ s.end }}</option> }
              </select>
            </label>
          </form>
          @if (!o.is_terminal) {
            <button type="button" class="primary" [disabled]="busy()" (click)="save()">O'zgarishlarni saqlash</button>
          }
        </section>

        <section class="card">
          <h2>Mahsulotlar</h2>
          <ul class="items">
            @for (i of o.items; track i.id) {
              <li><span>{{ i.name }}</span><span>{{ i.qty }} {{ i.unit }} × {{ i.price_snapshot | sum }}</span></li>
            }
          </ul>
          <div class="total"><span>Jami</span><b>{{ o.total | sum }}</b></div>
        </section>

        @if (!o.is_terminal) {
          <section class="card actions">
            @if (nextStage(); as next) {
              <button type="button" class="confirm" [disabled]="busy()" (click)="moveTo(next.code)">{{ next.name }} ✓</button>
            }
            <select #pick (change)="moveTo(pick.value)" aria-label="Bosqichni tanlash">
              <option value="">Bosqichni o'zgartirish…</option>
              @for (s of movableStages(); track s.id) { <option [value]="s.code">{{ s.name }}</option> }
            </select>
            @if (!cancelling()) {
              <button type="button" class="danger" (click)="cancelling.set(true)">Bekor qilish</button>
            } @else {
              <div class="cancel">
                <input #note placeholder="Bekor qilish sababi" [value]="cancelNote()" (input)="cancelNote.set(note.value)" />
                <button type="button" class="danger" (click)="cancel()">Tasdiqlash</button>
                <button type="button" class="ghost" (click)="cancelling.set(false)">Yopish</button>
              </div>
            }
          </section>
        }

        <section class="card">
          <h2>Tarix</h2>
          <ul class="events">
            @for (e of o.events; track e.id) {
              <li><b>{{ label(e.kind) }}</b> {{ e.to_stage_name }} <small>{{ e.actor_name }} · {{ e.created_at | date: 'dd.MM HH:mm' }}</small>
                @if (e.note) { <div class="note">{{ e.note }}</div> }
              </li>
            } @empty { <li class="muted">Hali yozuv yo'q</li> }
          </ul>
        </section>
      </div>
    } @else if (error(); as msg) {
      <p class="err" role="alert">{{ msg }}</p>
    }
  `,
  styles: [`
    .page { max-width: 48rem; margin: 0 auto; padding: 1rem; display: grid; gap: .75rem; }
    .top { display: flex; align-items: center; gap: 1rem; }
    .top h1 { margin: 0; font-size: 1.3rem; }
    .back { text-decoration: none; color: #444; }
    .stage { margin-left: auto; background: #fff4ec; color: #a34700; border-radius: 999px; padding: .2rem .7rem; font-size: .85rem; }
    .card { background: #fff; border-radius: 14px; padding: 1rem; }
    .card h2 { margin: 0 0 .5rem; font-size: 1rem; }
    .callrow { display: flex; gap: .5rem; align-items: center; margin-bottom: .75rem; }
    .call { text-decoration: none; background: #e8f7ee; color: #1a7f4b; font-weight: 700; border-radius: 999px; padding: .5rem 1rem; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: .6rem; }
    .grid .wide { grid-column: 1 / -1; }
    label { display: grid; gap: .25rem; }
    label span { font-size: .72rem; text-transform: uppercase; letter-spacing: .04em; color: #6b6b6b; }
    input, select { border: none; border-radius: 10px; background: #f3f3f3; padding: .6rem; font: inherit; }
    input:focus-visible, select:focus-visible { outline: 2px solid #F60; outline-offset: 2px; }
    .primary { margin-top: .75rem; border: none; border-radius: 12px; background: #F60; color: #fff; font: inherit;
      font-weight: 700; padding: .7rem 1.2rem; cursor: pointer; }
    .items { list-style: none; margin: 0; padding: 0; }
    .items li { display: flex; justify-content: space-between; gap: 1rem; padding: .35rem 0; border-bottom: 1px solid #f2f2f2; }
    .total { display: flex; justify-content: space-between; padding-top: .5rem; font-size: 1.05rem; }
    .actions { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
    .confirm { border: none; border-radius: 12px; background: #1a7f4b; color: #fff; font: inherit; font-weight: 700;
      padding: .7rem 1.2rem; cursor: pointer; }
    .danger { border: none; border-radius: 12px; background: #fff1f0; color: #b42318; font: inherit; font-weight: 700;
      padding: .7rem 1.2rem; cursor: pointer; }
    .ghost { border: 1px solid #d5d5d5; background: #fff; border-radius: 12px; padding: .6rem 1rem; font: inherit; cursor: pointer; }
    .cancel { display: flex; gap: .5rem; flex: 1 1 100%; }
    .cancel input { flex: 1; }
    .events { list-style: none; margin: 0; padding: 0; font-size: .9rem; }
    .events li { padding: .3rem 0; border-bottom: 1px solid #f2f2f2; }
    .events small { color: #6b6b6b; }
    .note { color: #444; }
    .muted { color: #767676; }
    .err { background: #fff1f0; color: #b42318; border-radius: 10px; padding: .6rem .9rem; margin: 0; }
    .ok { background: #e8f7ee; color: #1a7f4b; border-radius: 10px; padding: .6rem .9rem; margin: 0; }
    @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
  `],
})
export class OrderDetail {
  private api = inject(OperatorApi);
  private ordersApi = inject(OrdersApi);
  private route = inject(ActivatedRoute);

  readonly id = Number(this.route.snapshot.paramMap.get('id'));
  order = signal<OperatorOrder | null>(null);
  stages = signal<OperatorStage[]>([]);
  days = signal<DeliveryDay[]>([]);
  busy = signal(false);
  saved = signal(false);
  error = signal<string | null>(null);
  cancelling = signal(false);
  cancelNote = signal('');

  form = inject(FormBuilder).nonNullable.group({
    customer_name: '', phone: '', address: '', comment: '',
    delivery_date: '', delivery_slot_id: 0,
  });

  /** The next stage in the pipeline, skipping cancel stages. */
  nextStage = computed(() => {
    const current = this.order()?.stage_id ?? null;
    const flow = this.stages().filter((s) => !s.is_canceled);
    const index = flow.findIndex((s) => s.id === current);
    return index >= 0 ? flow[index + 1] ?? null : flow[0] ?? null;
  });

  movableStages = computed(() => this.stages().filter((s) => !s.is_canceled && s.id !== this.order()?.stage_id));

  slotsForDay = computed(() => {
    const day = this.days().find((d) => d.date === this.form.controls.delivery_date.value);
    return day?.slots ?? [];
  });

  constructor() {
    this.load();
    this.api.stages().subscribe({ next: (list) => this.stages.set(list), error: () => this.stages.set([]) });
    this.ordersApi.getDeliverySlots().subscribe({ next: (days) => this.days.set(days), error: () => this.days.set([]) });
  }

  load(): void {
    this.api.order(this.id).subscribe({
      next: (order) => this.apply(order),
      error: () => this.error.set('Buyurtma topilmadi.'),
    });
  }

  private apply(order: OperatorOrder): void {
    this.order.set(order);
    this.form.setValue({
      customer_name: order.customer_name, phone: order.phone, address: order.address,
      comment: order.comment, delivery_date: order.delivery_date ?? '',
      delivery_slot_id: order.delivery_slot ?? 0,
    });
    if (order.is_terminal) this.form.disable({ emitEvent: false });
    else this.form.enable({ emitEvent: false });
  }

  save(): void {
    if (this.busy()) return;
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    this.api.patchOrder(this.id, {
      customer_name: v.customer_name.trim(), phone: v.phone.trim(), address: v.address.trim(),
      comment: v.comment.trim(), delivery_date: v.delivery_date || null,
      delivery_slot_id: Number(v.delivery_slot_id) || null,
    }).subscribe({
      next: (order) => { this.apply(order); this.busy.set(false); this.saved.set(true); },
      error: (err: HttpErrorResponse) => { this.error.set(this.message(err)); this.busy.set(false); },
    });
  }

  moveTo(code: string): void {
    if (!code || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.api.moveStage(this.id, code).subscribe({
      next: (order) => { this.apply(order); this.busy.set(false); },
      error: (err: HttpErrorResponse) => { this.error.set(this.message(err)); this.busy.set(false); },
    });
  }

  cancel(): void {
    const note = this.cancelNote().trim();
    if (!note) { this.error.set('Bekor qilish uchun sabab yozing.'); return; }
    const canceled = this.stages().find((s) => s.is_canceled);
    if (!canceled) { this.error.set('Bu shaharda bekor qilish bosqichi sozlanmagan.'); return; }
    this.busy.set(true);
    this.api.moveStage(this.id, canceled.code, note).subscribe({
      next: (order) => { this.apply(order); this.cancelling.set(false); this.busy.set(false); },
      error: (err: HttpErrorResponse) => { this.error.set(this.message(err)); this.busy.set(false); },
    });
  }

  logCall(): void {
    this.api.logEvent(this.id, 'called').subscribe({ next: () => this.load(), error: () => { /* the call still happens */ } });
  }

  print(): void {
    this.api.logEvent(this.id, 'printed').subscribe({ next: () => { /* logged */ }, error: () => { /* ignore */ } });
    try { window.print(); } catch { /* headless */ }
  }

  label(kind: string): string {
    const map: Record<string, string> = { created: 'Yaratildi', stage: 'Bosqich', edited: 'Tahrirlandi',
      called: "Qo'ng'iroq", printed: 'Chop etildi' };
    return map[kind] ?? kind;
  }

  private message(err: HttpErrorResponse): string {
    const body = err.error as { detail?: string } | undefined;
    return body?.detail ?? "Saqlanmadi, qayta urinib ko'ring.";
  }
}
```
Add the child route in `frontend/src/app/app.routes.ts`:
```typescript
      { path: 'orders/:id', loadComponent: () => import('./features/order-admin/order-detail').then((m) => m.OrderDetail) },
```

- [ ] **Step 4: Run the full suite**

`npx ng test --watch=false` → all green (6 new tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/order-admin frontend/src/app/app.routes.ts
git commit -m "feat(frontend): operator order detail with call logging, editing, stage moves and cancellation"
```

---

## Task 10: Frontend — item editor inside the order detail

**Files:**
- Create: `frontend/src/app/features/order-admin/order-items-editor.ts` (+spec)
- Modify: `frontend/src/app/features/order-admin/order-detail.ts`, `order-detail.spec.ts`

- [ ] **Step 1: Write the failing spec**

Create `frontend/src/app/features/order-admin/order-items-editor.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { OrderItemsEditor } from './order-items-editor';

const ITEMS = [{ id: 1, city_product: 11, name: 'Olma', unit: 'kg', step: '0.500', qty: '1.000',
                 price_snapshot: '19300.00', line_total: '19300.00' }];

describe('OrderItemsEditor', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [OrderItemsEditor],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  async function create(disabled = false) {
    const fixture = TestBed.createComponent(OrderItemsEditor);
    fixture.componentRef.setInput('items', ITEMS);
    fixture.componentRef.setInput('disabled', disabled);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('steps a line up and down and keeps the running total', async () => {
    const fixture = await create();
    const c = fixture.componentInstance;
    c.step(0, 1);
    expect(c.lines()[0].qty).toBe('1.500');
    expect(c.total()).toBe(28950);
    c.step(0, -1);
    c.step(0, -1);
    expect(c.lines()[0].qty).toBe('0.500');
    c.step(0, -1);
    expect(c.lines().length).toBe(0);         // stepping below one step removes the line
  });

  it('adds a searched product and emits the payload on save', async () => {
    const fixture = await create();
    const c = fixture.componentInstance;
    const emitted: { city_product: number; qty: string }[][] = [];
    c.save.subscribe((payload) => emitted.push(payload));
    c.search.set('non');
    await fixture.whenStable();
    http.expectOne((r) => r.url.endsWith('/operator/products/') && r.params.get('search') === 'non')
      .flush([{ city_product_id: 12, name: 'Non', unit: 'sht', step: '1.000', price: '3000.00' }]);
    await fixture.whenStable();
    fixture.detectChanges();
    c.add({ city_product_id: 12, name: 'Non', unit: 'sht', step: '1.000', price: '3000.00' });
    expect(c.lines().length).toBe(2);
    c.emit();
    expect(emitted[0]).toEqual([{ city_product: 11, qty: '1.000' }, { city_product: 12, qty: '1.000' }]);
  });

  it('hides the controls for a closed order', async () => {
    const fixture = await create(true);
    expect(fixture.nativeElement.querySelector('button.plus')).toBeNull();
    expect(fixture.nativeElement.querySelector('input[type="search"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

`npx ng test --watch=false --include="src/app/features/order-admin/order-items-editor.spec.ts"` → FAIL (module not found).

- [ ] **Step 3: Implement the editor**

Create `frontend/src/app/features/order-admin/order-items-editor.ts`:
```typescript
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { OperatorApi } from '../../core/api/operator-api';
import { OperatorOrderItem, OperatorProduct } from '../../core/api/models/operator.models';
import { SumPipe } from '../../shared/pipes/sum.pipe';

export interface EditorLine {
  city_product: number;
  name: string;
  unit: string;
  step: string;
  qty: string;
  price: string;
}

const dec = (value: string) => Number(value);
const fixed = (value: number) => value.toFixed(3);

/** Edits an order's lines: step a quantity, drop a line, or add a product found by name. */
@Component({
  selector: 'tx-order-items-editor',
  standalone: true,
  imports: [SumPipe],
  template: `
    <ul class="lines">
      @for (line of lines(); track line.city_product; let i = $index) {
        <li>
          <div class="name"><b>{{ line.name }}</b><small>{{ line.price | sum }} / {{ line.unit }}</small></div>
          @if (!disabled()) {
            <div class="qty">
              <button type="button" class="minus" (click)="step(i, -1)" aria-label="Kamaytirish">−</button>
              <span>{{ line.qty }} {{ line.unit }}</span>
              <button type="button" class="plus" (click)="step(i, 1)" aria-label="Ko'paytirish">+</button>
            </div>
          } @else {
            <div class="qty"><span>{{ line.qty }} {{ line.unit }}</span></div>
          }
          <div class="sum">{{ lineTotal(line) | sum }}</div>
        </li>
      } @empty { <li class="muted">Mahsulot yo'q</li> }
    </ul>

    <div class="total"><span>Jami</span><b>{{ String(total()) | sum }}</b></div>

    @if (!disabled()) {
      <div class="adder">
        <input #box type="search" placeholder="Mahsulot qidirish" aria-label="Mahsulot qidirish"
          [value]="search()" (input)="search.set(box.value)" />
        @if (found().length) {
          <ul class="found">
            @for (p of found(); track p.city_product_id) {
              <li><button type="button" (click)="add(p); search.set(''); box.value = ''">{{ p.name }} · {{ p.price | sum }}</button></li>
            }
          </ul>
        }
      </div>
      <button type="button" class="save" [disabled]="!dirty()" (click)="emit()">Mahsulotlarni saqlash</button>
    }
  `,
  styles: [`
    .lines { list-style: none; margin: 0; padding: 0; }
    .lines li { display: grid; grid-template-columns: 1fr auto 6rem; gap: .75rem; align-items: center;
      padding: .4rem 0; border-bottom: 1px solid #f2f2f2; }
    .name small { display: block; color: #6b6b6b; font-size: .78rem; }
    .qty { display: flex; align-items: center; gap: .5rem; }
    .qty button { width: 2rem; height: 2rem; border: none; border-radius: 50%; background: #f0f0f0; font: inherit; cursor: pointer; }
    .sum { text-align: right; font-weight: 700; }
    .total { display: flex; justify-content: space-between; padding: .5rem 0; font-size: 1.05rem; }
    .adder { position: relative; margin-top: .5rem; }
    .adder input { width: 100%; border: none; border-radius: 10px; background: #f3f3f3; padding: .6rem; font: inherit; }
    .found { list-style: none; margin: .25rem 0 0; padding: 0; background: #fff; border: 1px solid #eee; border-radius: 10px; }
    .found button { width: 100%; text-align: left; border: none; background: none; padding: .5rem .75rem; font: inherit; cursor: pointer; }
    .save { margin-top: .6rem; border: none; border-radius: 12px; background: #F60; color: #fff; font: inherit;
      font-weight: 700; padding: .6rem 1.1rem; cursor: pointer; }
    .save:disabled { background: #e6e6e6; color: #6b6b6b; cursor: default; }
    .muted { color: #767676; padding: .5rem 0; }
  `],
})
export class OrderItemsEditor {
  private api = inject(OperatorApi);

  items = input.required<OperatorOrderItem[]>();
  disabled = input(false);
  save = output<{ city_product: number; qty: string }[]>();

  lines = signal<EditorLine[]>([]);
  search = signal('');
  found = signal<OperatorProduct[]>([]);
  dirty = signal(false);
  protected readonly String = String;

  total = computed(() => this.lines().reduce((sum, l) => sum + dec(l.qty) * dec(l.price), 0));

  constructor() {
    effect(() => {
      // Reset the working copy whenever the server sends a fresh order.
      const source = this.items();
      this.lines.set(source.map((i) => ({
        city_product: i.city_product, name: i.name, unit: i.unit, step: i.step,
        qty: i.qty, price: i.price_snapshot,
      })));
      this.dirty.set(false);
    });

    toObservable(this.search).pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap((term) => term.trim().length < 2
        ? of([] as OperatorProduct[])
        : this.api.products(term.trim()).pipe(catchError(() => of([] as OperatorProduct[])))),
      takeUntilDestroyed(),
    ).subscribe((list) => this.found.set(list));
  }

  lineTotal(line: EditorLine): string {
    return (dec(line.qty) * dec(line.price)).toFixed(2);
  }

  step(index: number, direction: 1 | -1): void {
    this.lines.update((list) => {
      const line = list[index];
      if (!line) return list;
      const next = dec(line.qty) + direction * dec(line.step);
      if (next < dec(line.step)) return list.filter((_, i) => i !== index);
      return list.map((l, i) => (i === index ? { ...l, qty: fixed(next) } : l));
    });
    this.dirty.set(true);
  }

  add(product: OperatorProduct): void {
    this.lines.update((list) => {
      const existing = list.findIndex((l) => l.city_product === product.city_product_id);
      if (existing >= 0) {
        return list.map((l, i) => (i === existing ? { ...l, qty: fixed(dec(l.qty) + dec(l.step)) } : l));
      }
      return [...list, { city_product: product.city_product_id, name: product.name, unit: product.unit,
                         step: product.step, qty: fixed(dec(product.step)), price: product.price }];
    });
    this.found.set([]);
    this.dirty.set(true);
  }

  emit(): void {
    this.save.emit(this.lines().map((l) => ({ city_product: l.city_product, qty: l.qty })));
  }
}
```

- [ ] **Step 4: Mount it in the detail page**

In `frontend/src/app/features/order-admin/order-detail.ts` import the editor, add it to `imports`, replace the read-only `Mahsulotlar` card body with:
```html
          <tx-order-items-editor [items]="o.items" [disabled]="o.is_terminal" (save)="saveItems($event)" />
```
and add the handler:
```typescript
  saveItems(items: { city_product: number; qty: string }[]): void {
    this.busy.set(true);
    this.error.set(null);
    this.api.replaceItems(this.id, items).subscribe({
      next: (order) => { this.apply(order); this.busy.set(false); this.saved.set(true); },
      error: (err: HttpErrorResponse) => { this.error.set(this.message(err)); this.busy.set(false); },
    });
  }
```
In `order-detail.spec.ts` the "shows the order with a call link" test still expects `Olma` and the total; keep it. Add one test:
```typescript
  it('sends replaced items to the server', async () => {
    const fixture = await create();
    fixture.componentInstance.saveItems([{ city_product: 11, qty: '2.000' }]);
    const req = http.expectOne((r) => r.url.endsWith('/operator/orders/7/items/') && r.method === 'PUT');
    expect(req.request.body).toEqual({ items: [{ city_product: 11, qty: '2.000' }] });
    req.flush({ ...ORDER, total: '38600.00' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("38 600 so'm");
  });
```

- [ ] **Step 5: Run the full suite**

`npx ng test --watch=false` → all green (4 new tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/order-admin
git commit -m "feat(frontend): operator item editor with product search and quantity steppers"
```

---

## Task 11: Frontend — 80 mm printable receipt

**Files:**
- Create: `frontend/src/app/features/order-admin/order-receipt.ts` (+spec)
- Modify: `frontend/src/app/features/order-admin/order-detail.ts`, `frontend/src/styles.scss`

- [ ] **Step 1: Write the failing spec**

Create `frontend/src/app/features/order-admin/order-receipt.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { OrderReceipt } from './order-receipt';

const ORDER = {
  id: 7, city: 1, user: null, customer_name: 'Aziz Karimov', phone: '+998901234567',
  address: 'Chilonzor 5, 3-podyezd', latitude: null, longitude: null, comment: "Qo'ng'iroq qiling",
  payment_type: 'cash', total: '105100.00', stage: 'accepted', stage_id: 2, stage_name: 'Tasdiqlandi',
  is_terminal: false, delivery_date: '2026-09-21', delivery_start: '16:00', delivery_end: '19:00',
  delivery_window: '16:00 – 19:00', delivery_slot: 5,
  created_at: '2026-09-20T14:05:00+05:00', updated_at: '2026-09-20T14:05:00+05:00',
  items: [
    { id: 1, city_product: 11, name: 'Olma', unit: 'kg', step: '0.500', qty: '2.000', price_snapshot: '19300.00', line_total: '38600.00' },
    { id: 2, city_product: 12, name: 'Non', unit: 'sht', step: '1.000', qty: '3.000', price_snapshot: '3000.00', line_total: '9000.00' },
  ],
  events: [],
};

describe('OrderReceipt', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [OrderReceipt] }));

  it('prints the shop line, the order, every item and the totals', async () => {
    const fixture = TestBed.createComponent(OrderReceipt);
    fixture.componentRef.setInput('order', ORDER);
    fixture.componentRef.setInput('cityName', 'Guliston');
    await fixture.whenStable();
    fixture.detectChanges();
    const text = (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ');
    expect(text).toContain('TEZXARID');
    expect(text).toContain('Guliston');
    expect(text).toContain('№ 7');
    expect(text).toContain('21.09.2026');
    expect(text).toContain('16:00 – 19:00');
    expect(text).toContain('Olma');
    expect(text).toContain('2 kg');
    expect(text).toContain("38 600 so'm");
    expect(text).toContain("105 100 so'm");
    expect(text).toContain('Naqd');
    expect(text).toContain('Aziz Karimov');
    expect(text).toContain('Chilonzor 5, 3-podyezd');
    expect(text).toContain("Qo'ng'iroq qiling");
    expect(fixture.nativeElement.querySelector('.receipt')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

`npx ng test --watch=false --include="src/app/features/order-admin/order-receipt.spec.ts"` → FAIL (module not found).

- [ ] **Step 3: Implement the receipt**

Create `frontend/src/app/features/order-admin/order-receipt.ts`:
```typescript
import { Component, computed, input } from '@angular/core';
import { OperatorOrder } from '../../core/api/models/operator.models';
import { SumPipe } from '../../shared/pipes/sum.pipe';
import { unitLabel } from '../../shared/utils/units';

/** Paper receipt. Hidden on screen; the global @media print rule reveals just this block. */
@Component({
  selector: 'tx-order-receipt',
  standalone: true,
  imports: [SumPipe],
  template: `
    @if (order(); as o) {
      <div class="receipt">
        <div class="head">
          <b>TEZXARID</b>
          <div>{{ cityName() }}</div>
        </div>
        <div class="line"></div>
        <div class="row"><span>Buyurtma</span><b>№ {{ o.id }}</b></div>
        <div class="row"><span>Qabul</span><span>{{ acceptedAt() }}</span></div>
        <div class="row"><span>Yetkazish</span><span>{{ deliveryAt() }}</span></div>
        <div class="line"></div>
        @for (i of o.items; track i.id) {
          <div class="item">
            <div class="n">{{ i.name }}</div>
            <div class="q"><span>{{ qty(i.qty) }} {{ unit(i.unit) }}</span><span>{{ i.line_total | sum }}</span></div>
          </div>
        }
        <div class="line"></div>
        <div class="row total"><span>JAMI</span><b>{{ o.total | sum }}</b></div>
        <div class="row"><span>To'lov</span><span>{{ o.payment_type === 'cash' ? 'Naqd' : 'Online' }}</span></div>
        <div class="line"></div>
        <div class="who">
          <div><b>{{ o.customer_name }}</b></div>
          <div>{{ o.phone }}</div>
          <div>{{ o.address }}</div>
          @if (o.comment) { <div>Izoh: {{ o.comment }}</div> }
        </div>
        <div class="line"></div>
        <div class="foot">Rahmat! Yana kutamiz</div>
      </div>
    }
  `,
  styles: [`
    :host { display: none; }
    .receipt { width: 72mm; font-family: 'Courier New', monospace; font-size: 12px; color: #000; }
    .head { text-align: center; margin-bottom: .5rem; }
    .head b { font-size: 16px; letter-spacing: .1em; }
    .line { border-top: 1px dashed #000; margin: .35rem 0; }
    .row { display: flex; justify-content: space-between; gap: .5rem; }
    .row.total b { font-size: 14px; }
    .item { margin: .15rem 0; }
    .item .q { display: flex; justify-content: space-between; }
    .who div { word-break: break-word; }
    .foot { text-align: center; margin-top: .4rem; }
  `],
})
export class OrderReceipt {
  order = input.required<OperatorOrder | null>();
  cityName = input('');

  acceptedAt = computed(() => this.stamp(this.order()?.created_at ?? ''));
  deliveryAt = computed(() => {
    const o = this.order();
    if (!o?.delivery_date) return "sana ko'rsatilmagan";
    const [y, m, d] = o.delivery_date.split('-');
    const window = o.delivery_start && o.delivery_end ? ` ${o.delivery_start} – ${o.delivery_end}` : '';
    return `${d}.${m}.${y}${window}`;
  });

  qty(value: string): number { return Number(value); }
  unit(value: string): string { return unitLabel(value); }

  private stamp(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}
```

- [ ] **Step 4: Reveal it on print**

Append to `frontend/src/styles.scss`:
```scss
/* Printing an order: only the receipt block reaches the paper. */
@media print {
  body * { visibility: hidden; }
  tx-order-receipt { display: block !important; }
  tx-order-receipt .receipt, tx-order-receipt .receipt * { visibility: visible; }
  tx-order-receipt .receipt { position: absolute; left: 0; top: 0; }
  @page { size: 80mm auto; margin: 4mm; }
}
```
In `frontend/src/app/features/order-admin/order-detail.ts` import `OrderReceipt`, add it to `imports`, and place it at the end of the `@if (order(); as o)` block:
```html
        <tx-order-receipt [order]="o" [cityName]="store.operator()?.city_name ?? ''" />
```
adding `store = inject(OperatorStore);` to the class (import from `../../core/operator/operator.store`).

- [ ] **Step 5: Run the full suite**

`npx ng test --watch=false` → all green (1 new test).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/order-admin frontend/src/styles.scss
git commit -m "feat(frontend): 80mm printable receipt for an order"
```

---

## Task 12: Frontend — city customers list and detail

**Files:**
- Create: `frontend/src/app/features/order-admin/customers.ts` (+spec), `frontend/src/app/features/order-admin/customer-detail.ts` (+spec)
- Modify: `frontend/src/app/app.routes.ts`

- [ ] **Step 1: Write the failing specs**

Create `frontend/src/app/features/order-admin/customers.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Customers } from './customers';

const ROW = { id: 3, name: 'Aziz Karimov', username: 'tg_1', phone: '+998901234567', telegram_id: 1,
  date_joined: '2026-09-01T10:00:00+05:00', orders_count: 4, orders_total: '105100.00',
  last_order_at: '2026-09-19T18:00:00+05:00' };

describe('Customers', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [Customers],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => vi.useRealTimers());

  it('lists the city customers with counts and spend', async () => {
    const fixture = TestBed.createComponent(Customers);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/operator/customers/')).flush({ count: 1, results: [ROW] });
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Aziz Karimov');
    expect(text).toContain('+998901234567');
    expect(text).toContain('4');
    expect(text).toContain("105 100 so'm");
  });

  it('searches by name or phone', async () => {
    const fixture = TestBed.createComponent(Customers);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/operator/customers/')).flush({ count: 0, results: [] });
    await vi.advanceTimersByTimeAsync(0);
    fixture.componentInstance.query.set('aziz');
    await vi.advanceTimersByTimeAsync(400);
    const req = http.expectOne((r) => r.url.endsWith('/operator/customers/') && r.params.get('q') === 'aziz');
    req.flush({ count: 1, results: [ROW] });
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Aziz Karimov');
  });
});
```
Create `frontend/src/app/features/order-admin/customer-detail.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { CustomerDetail } from './customer-detail';

const ORDER = {
  id: 7, city: 1, user: 3, customer_name: 'Aziz', phone: '+998901234567', address: 'Chilonzor 5',
  latitude: null, longitude: null, comment: '', payment_type: 'cash', total: '19300.00',
  stage: 'done', stage_id: 5, stage_name: 'Yetkazildi', is_terminal: true,
  delivery_date: '2026-09-21', delivery_start: '09:00', delivery_end: '12:00',
  delivery_window: '09:00 – 12:00', delivery_slot: 4, created_at: '2026-09-20T10:00:00+05:00',
  updated_at: '2026-09-20T10:00:00+05:00',
  items: [{ id: 1, city_product: 11, name: 'Olma', unit: 'kg', step: '0.500', qty: '1.000',
            price_snapshot: '19300.00', line_total: '19300.00' }],
  events: [],
};
const CUSTOMER = { id: 3, name: 'Aziz Karimov', username: 'tg_1', phone: '+998901234567', telegram_id: 1,
  date_joined: '2026-09-01T10:00:00+05:00', orders_count: 1, orders_total: '19300.00',
  last_order_at: '2026-09-20T10:00:00+05:00',
  addresses: [{ id: 1, title: 'Uy', address: 'Chilonzor 5', is_default: true }],
  orders: [ORDER] };

describe('CustomerDetail', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CustomerDetail],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '3' }) } } }],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('shows the profile, the saved addresses and every order with its items', async () => {
    const fixture = TestBed.createComponent(CustomerDetail);
    fixture.detectChanges();
    http.expectOne((r) => r.url.endsWith('/operator/customers/3/')).flush(CUSTOMER);
    await fixture.whenStable();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Aziz Karimov');
    expect(text).toContain('Uy');
    expect(text).toContain('№ 7');
    expect(text).toContain('Yetkazildi');
    (fixture.nativeElement.querySelector('button.toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Olma');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

`npx ng test --watch=false --include="src/app/features/order-admin/customer*.spec.ts"` → FAIL (modules not found).

- [ ] **Step 3: Implement the list**

Create `frontend/src/app/features/order-admin/customers.ts`:
```typescript
import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, debounceTime, distinctUntilChanged, of, startWith, switchMap } from 'rxjs';
import { OperatorApi } from '../../core/api/operator-api';
import { OperatorCustomerRow } from '../../core/api/models/operator.models';
import { SumPipe } from '../../shared/pipes/sum.pipe';

/** Everyone who has ordered in this city, or whose profile city is this one. */
@Component({
  selector: 'tx-customers',
  standalone: true,
  imports: [RouterLink, SumPipe, DatePipe],
  template: `
    <div class="page">
      <input #q type="search" placeholder="Ism yoki telefon" aria-label="Mijoz qidirish"
        [value]="query()" (input)="query.set(q.value)" />
      <div class="rows">
        @for (c of rows(); track c.id) {
          <a class="row" [routerLink]="['/order-admin/customers', c.id]">
            <div class="who"><b>{{ c.name }}</b><small>{{ c.phone || '—' }}</small></div>
            <div class="n">{{ c.orders_count }}<small>buyurtma</small></div>
            <div class="sum">{{ c.orders_total | sum }}</div>
            <div class="last">{{ c.last_order_at ? (c.last_order_at | date: 'dd.MM.yyyy') : '—' }}</div>
          </a>
        } @empty { <p class="empty">Mijoz topilmadi</p> }
      </div>
    </div>
  `,
  styles: [`
    .page { max-width: 60rem; margin: 0 auto; padding: 1rem; }
    input { width: 100%; border: none; border-radius: 12px; background: #fff; padding: .7rem .9rem; font: inherit; margin-bottom: .75rem; }
    .rows { display: grid; gap: .5rem; }
    .row { display: grid; grid-template-columns: 1fr 6rem 9rem 7rem; gap: .75rem; align-items: center;
      background: #fff; border-radius: 12px; padding: .75rem 1rem; text-decoration: none; color: #1a1a1a; }
    .row small { display: block; color: #6b6b6b; font-size: .78rem; }
    .sum { font-weight: 700; text-align: right; }
    .last { text-align: right; color: #6b6b6b; }
    .empty { text-align: center; color: #767676; padding: 2rem; }
    @media (max-width: 720px) { .row { grid-template-columns: 1fr auto; } .n, .last { display: none; } }
  `],
})
export class Customers {
  private api = inject(OperatorApi);
  query = signal('');
  rows = signal<OperatorCustomerRow[]>([]);

  constructor() {
    toObservable(this.query).pipe(
      debounceTime(300),
      distinctUntilChanged(),
      startWith(''),
      switchMap((q) => this.api.customers(q.trim()).pipe(catchError(() => of({ count: 0, results: [] })))),
      takeUntilDestroyed(),
    ).subscribe((page) => this.rows.set(page.results));
  }
}
```

- [ ] **Step 4: Implement the detail page**

Create `frontend/src/app/features/order-admin/customer-detail.ts`:
```typescript
import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { OperatorApi } from '../../core/api/operator-api';
import { OperatorCustomer } from '../../core/api/models/operator.models';
import { SumPipe } from '../../shared/pipes/sum.pipe';

/** One customer: profile, saved addresses and every order they placed in this city. */
@Component({
  selector: 'tx-customer-detail',
  standalone: true,
  imports: [RouterLink, SumPipe, DatePipe],
  template: `
    @if (customer(); as c) {
      <div class="page">
        <div class="top">
          <a routerLink="/order-admin/customers" class="back">← Mijozlar</a>
          <h1>{{ c.name }}</h1>
        </div>

        <section class="card">
          <div class="facts">
            <div><span>Telefon</span><b>{{ c.phone || '—' }}</b></div>
            <div><span>Telegram</span><b>{{ c.telegram_id ?? '—' }}</b></div>
            <div><span>Ro'yxatdan</span><b>{{ c.date_joined | date: 'dd.MM.yyyy' }}</b></div>
            <div><span>Buyurtmalar</span><b>{{ c.orders_count }}</b></div>
            <div><span>Jami xarid</span><b>{{ c.orders_total | sum }}</b></div>
          </div>
        </section>

        <section class="card">
          <h2>Manzillar</h2>
          <ul class="plain">
            @for (a of c.addresses; track a.id) {
              <li><b>{{ a.title || 'Manzil' }}</b> {{ a.address }} @if (a.is_default) { <span class="tag">Asosiy</span> }</li>
            } @empty { <li class="muted">Saqlangan manzil yo'q</li> }
          </ul>
        </section>

        <section class="card">
          <h2>Buyurtmalar</h2>
          @for (o of c.orders; track o.id) {
            <div class="order">
              <button type="button" class="toggle" (click)="toggle(o.id)">
                <b>№ {{ o.id }}</b>
                <span>{{ o.delivery_date }} {{ o.delivery_window }}</span>
                <span class="stage">{{ o.stage_name }}</span>
                <span class="sum">{{ o.total | sum }}</span>
              </button>
              @if (open().has(o.id)) {
                <ul class="plain items">
                  @for (i of o.items; track i.id) {
                    <li><span>{{ i.name }}</span><span>{{ i.qty }} {{ i.unit }} × {{ i.price_snapshot | sum }}</span></li>
                  }
                </ul>
                <div class="meta">{{ o.address }} @if (o.comment) { · {{ o.comment }} }</div>
                <a class="open" [routerLink]="['/order-admin/orders', o.id]">Buyurtmani ochish →</a>
              }
            </div>
          } @empty { <p class="muted">Buyurtma yo'q</p> }
        </section>
      </div>
    } @else if (error()) {
      <p class="err" role="alert">Mijoz topilmadi.</p>
    }
  `,
  styles: [`
    .page { max-width: 48rem; margin: 0 auto; padding: 1rem; display: grid; gap: .75rem; }
    .top { display: flex; align-items: center; gap: 1rem; }
    .top h1 { margin: 0; font-size: 1.25rem; }
    .back { text-decoration: none; color: #444; }
    .card { background: #fff; border-radius: 14px; padding: 1rem; }
    .card h2 { margin: 0 0 .5rem; font-size: 1rem; }
    .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr)); gap: .5rem; }
    .facts span { display: block; font-size: .72rem; text-transform: uppercase; color: #6b6b6b; }
    .plain { list-style: none; margin: 0; padding: 0; }
    .plain li { display: flex; justify-content: space-between; gap: 1rem; padding: .3rem 0; border-bottom: 1px solid #f2f2f2; }
    .tag { background: #fff4ec; color: #a34700; border-radius: 999px; padding: .1rem .5rem; font-size: .7rem; }
    .order { border-bottom: 1px solid #f2f2f2; padding: .25rem 0; }
    .toggle { display: grid; grid-template-columns: 5rem 1fr 8rem 7rem; gap: .5rem; width: 100%; text-align: left;
      border: none; background: none; font: inherit; padding: .5rem 0; cursor: pointer; align-items: center; }
    .toggle .sum { text-align: right; font-weight: 700; }
    .toggle .stage { color: #6b6b6b; }
    .items { margin: .25rem 0 .5rem; font-size: .9rem; }
    .meta { color: #6b6b6b; font-size: .85rem; }
    .open { color: #F60; font-weight: 700; text-decoration: none; font-size: .9rem; }
    .muted { color: #767676; }
    .err { background: #fff1f0; color: #b42318; border-radius: 10px; padding: .6rem .9rem; margin: 1rem; }
    @media (max-width: 640px) { .toggle { grid-template-columns: 4rem 1fr auto; } .toggle .stage { display: none; } }
  `],
})
export class CustomerDetail {
  private api = inject(OperatorApi);
  private route = inject(ActivatedRoute);

  customer = signal<OperatorCustomer | null>(null);
  error = signal(false);
  open = signal(new Set<number>());

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.api.customer(id).subscribe({
      next: (c) => this.customer.set(c),
      error: () => this.error.set(true),
    });
  }

  toggle(orderId: number): void {
    this.open.update((set) => {
      const next = new Set(set);
      next.has(orderId) ? next.delete(orderId) : next.add(orderId);
      return next;
    });
  }
}
```
Add both child routes in `frontend/src/app/app.routes.ts`:
```typescript
      { path: 'customers', loadComponent: () => import('./features/order-admin/customers').then((m) => m.Customers) },
      { path: 'customers/:id', loadComponent: () => import('./features/order-admin/customer-detail').then((m) => m.CustomerDetail) },
```

- [ ] **Step 5: Run the full suite**

`npx ng test --watch=false` → all green (3 new tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/order-admin frontend/src/app/app.routes.ts
git commit -m "feat(frontend): operator customer directory with per-customer order history"
```

---

## Task 13: Frontend — the customer sees the live stage

**Files:**
- Modify: `frontend/src/app/core/api/models/order.models.ts`, `frontend/src/app/shared/utils/order-status.ts` (+spec), `frontend/src/app/shared/ui/order-card/order-card.ts` (+spec), `frontend/src/app/features/orders/orders.ts`

- [ ] **Step 1: Write the failing specs**

Append to `frontend/src/app/shared/utils/order-status.spec.ts` (add `stageLabel`, `isActiveOrder` to the import line):
```typescript
  it('prefers the label the server sent and falls back to the local map', () => {
    expect(stageLabel({ status: 'preparing', status_label: "Yig'ilmoqda" })).toBe("Yig'ilmoqda");
    expect(stageLabel({ status: 'done', status_label: '' })).toBe('Yetkazildi');
    expect(stageLabel({ status: 'weird', status_label: '' })).toBe('weird');
  });

  it('treats an order as active until the server marks it final or cancelled', () => {
    expect(isActiveOrder({ status: 'preparing', is_final: false, is_canceled: false })).toBe(true);
    expect(isActiveOrder({ status: 'done', is_final: true, is_canceled: false })).toBe(false);
    expect(isActiveOrder({ status: 'canceled', is_final: false, is_canceled: true })).toBe(false);
    expect(isActiveOrder({ status: 'accepted' })).toBe(true);          // legacy payload without the flags
  });
```
Append to `frontend/src/app/shared/ui/order-card/order-card.spec.ts`:
```typescript
  it('shows the server stage label and the progress line', async () => {
    const fixture = await create({ ...ORDER, status: 'preparing', status_label: "Yig'ilmoqda",
      status_step: 3, status_total: 5, is_final: false, is_canceled: false } as Order);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("Yig'ilmoqda");
    const bar = fixture.nativeElement.querySelector('.progress span') as HTMLElement;
    expect(bar.style.width).toBe('60%');
  });

  it('hides the progress line for a finished order', async () => {
    const fixture = await create({ ...ORDER, status: 'done', status_label: 'Yetkazildi',
      status_step: 5, status_total: 5, is_final: true, is_canceled: false } as Order);
    expect(fixture.nativeElement.querySelector('.progress')).toBeNull();
  });
```

- [ ] **Step 2: Run to verify they fail**

`npx ng test --watch=false --include="src/app/shared/utils/order-status.spec.ts" --include="src/app/shared/ui/order-card/*.spec.ts"` → FAIL.

- [ ] **Step 3: Model and helpers**

In `frontend/src/app/core/api/models/order.models.ts` add to the `Order` interface:
```typescript
  status_label?: string;
  status_step?: number;
  status_total?: number;
  is_final?: boolean;
  is_canceled?: boolean;
```
Append to `frontend/src/app/shared/utils/order-status.ts`:
```typescript
/** The city may name its own stages: prefer the server's label, fall back to the built-in map. */
export function stageLabel(order: { status: string; status_label?: string }): string {
  return order.status_label?.trim() || orderStatusLabel(order.status);
}

/** Active until the server says the order reached a final or cancelled stage. */
export function isActiveOrder(order: { status: string; is_final?: boolean; is_canceled?: boolean }): boolean {
  if (order.is_final || order.is_canceled) return false;
  if (order.is_final === undefined && order.is_canceled === undefined) return isActiveStatus(order.status);
  return true;
}
```

- [ ] **Step 4: Card and list**

In `frontend/src/app/shared/ui/order-card/order-card.ts` import `stageLabel`, change the computed and add the bar:
```typescript
  statusLabel = computed(() => (this.local() ? 'Yuborilgan' : stageLabel(this.order())));
  progress = computed(() => {
    const o = this.order();
    if (this.local() || o.is_final || o.is_canceled) return null;
    const step = o.status_step ?? 0;
    const total = o.status_total ?? 0;
    return total > 0 && step > 0 ? Math.round((step / total) * 100) : null;
  });
```
and in the template, right below the `.when` line:
```html
        @if (progress(); as pct) {
          <div class="progress" role="img" [attr.aria-label]="statusLabel()"><span [style.width.%]="pct"></span></div>
        }
```
with the style:
```css
    .progress { height: 4px; border-radius: 2px; background: #f0f0f0; margin-top: .4rem; overflow: hidden; }
    .progress span { display: block; height: 100%; background: #F60; }
```
In `frontend/src/app/features/orders/orders.ts` swap the tab filter to the new helper:
```typescript
import { isActiveOrder } from '../../shared/utils/order-status';
```
```typescript
  shown = computed(() => this.source().filter((o) => (this.tab() === 'active' ? isActiveOrder(o) : !isActiveOrder(o))));
```

- [ ] **Step 5: Run the full suite**

`npx ng test --watch=false` → all green (4 new tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/shared frontend/src/app/features/orders frontend/src/app/core/api/models/order.models.ts
git commit -m "feat(frontend): customers see the per-city stage name and a progress line"
```

---

## Task 14: Build, smoke, docs

**Files:** `docs/deploy.md`, this plan (post-implementation notes)

- [ ] **Step 1: Full suites and production build**

From `backend/`: `PY -m pytest -q` → all pass. From `frontend/`: `npx ng test --watch=false` → all pass; `npx ng build` → "Application bundle generation complete" with new lazy chunks for the console.

- [ ] **Step 2: API smoke against the dev server**

From `backend/` start the server (`PY manage.py runserver 8000 --noreload`) and create an operator:
```powershell
$env:DJANGO_SETTINGS_MODULE = 'config.settings.dev'
PY manage.py shell -c "from django.contrib.auth import get_user_model; from apps.cities.models import City; U=get_user_model(); c=City.objects.first(); u,_=U.objects.get_or_create(username='op', defaults={'role':'city_admin','is_staff':True}); u.city=c; u.role='city_admin'; u.is_staff=True; u.set_password('op12345'); u.save(); print(u.id, c.name)"
```
Then (PowerShell):
```powershell
$login = Invoke-RestMethod -Method Post http://localhost:8000/api/auth/login/ -ContentType 'application/json' -Body '{"username":"op","password":"op12345"}'
$h = @{ Authorization = "Bearer $($login.access)" }
Invoke-RestMethod http://localhost:8000/api/operator/stages/ -Headers $h | Select-Object code, name
Invoke-RestMethod http://localhost:8000/api/operator/orders/ -Headers $h | Select-Object count
Invoke-RestMethod http://localhost:8000/api/operator/customers/ -Headers $h | Select-Object count
```
Expected: six stages, the city's order count, the customer count. A customer JWT against the same URLs must return 403.

- [ ] **Step 3: Browser smoke**

Start `npx ng serve`, sign in at `http://localhost:4200/order-admin/login` with `op` / `op12345` and check: the board lists the city's orders with stage tabs and counters; opening an order shows the call link, the editable fields and the items; changing a quantity and saving updates the total; "Tasdiqlash" moves the stage and the customer's `/orders` page shows the new label; cancelling asks for a reason; the receipt appears in the browser's print preview at 80 mm; the customers page lists the city's buyers and opening one shows their orders. Console: no errors.

- [ ] **Step 4: Deploy doc**

Append to `docs/deploy.md`:
```markdown
## 8. Operator konsoli (/order-admin)

1. Migratsiya majburiy: `python manage.py migrate` (buyurtma holatlari endi `OrderStage` jadvalida).
2. Django adminda har shahar uchun operator yarating: *Users* → *Add user* → login va parol → `role = City admin`, `city = <shahar>`, `is_staff = ✓`. Superadmin barcha shaharlarni ko'radi.
3. Bosqichlar: *Order stages* bo'limida har shahar uchun avtomatik 6 ta bosqich yaratiladi (Yangi, Tasdiqlandi, Yig'ilmoqda, Yo'lda, Yetkazildi, Bekor qilindi). Nomini, tartibini o'zgartirish yoki keraksizini o'chirish mumkin; bittasi `is_initial`, bittasi `is_canceled` bo'lishi kerak.
4. Operator `https://<frontend>/order-admin` manzilidan login va parol bilan kiradi. Konsol ommaviy saytda joylashgan, shuning uchun parollar kuchli bo'lsin.
5. Chek: buyurtma sahifasidagi "Chekni chop etish" brauzer print oynasini ochadi; printer qog'ozi 80mm qilib sozlansa chek to'g'ri chiqadi.
6. Mijoz ilovasida buyurtma holati shahar bosqichining nomi bilan ko'rinadi.
```

- [ ] **Step 5: Post-implementation notes and commit**

Append a `## Post-implementation notes` section to this plan (test counts, bundle sizes, smoke findings, carry-overs) and commit:
```bash
git add docs/deploy.md docs/superpowers/plans/2026-09-20-tezxarid-order-admin.md
git commit -m "docs: operator console deploy steps and Plan 4 post-implementation notes"
```

---

## Self-Review

**Spec coverage:** §2 decisions — operator accounts and login (Task 2), city scope (Task 2), stages (Task 1), `Order.stage` (Task 1), editing until terminal (Task 4), audit (Tasks 2, 4), receipt (Task 11), polling and beep (Task 8), console location (Tasks 6, 7), separate tokens (Task 6). §3.1–3.2 models and defaults (Tasks 1, 2). §3.3 auth and permissions (Task 2). §3.4 every endpoint (Tasks 3, 4, 5). §3.5 customer-facing fields (Task 1) and their UI (Task 13). §3.6 Django admin (Tasks 1, 2). §4.1 routing (Task 6). §4.2 session (Task 6) and API client (Task 7). §4.3 screens (Tasks 7–12). §4.4 customer changes (Task 13). §4.5 errors — login message (Task 7), silent refresh and sign-out (Task 6), inline banners (Task 9), stale poll hint (Task 8). §4.6 testing — every task. §5 delivery notes (Task 14).

**Placeholder scan:** no TBD/TODO; every step carries the code or the exact command it needs.

**Type consistency:** `OperatorSession`/`OperatorUser` (Task 6) are what `OperatorApi.login` returns (Task 7) and what `OperatorStore.set` takes. `OperatorOrder`, `OperatorOrderRow`, `OperatorStage`, `OperatorProduct`, `OperatorCustomer` (Task 6) match the serializers in Tasks 3–5 field for field, including `stage`, `stage_id`, `stage_name`, `is_terminal`, `delivery_window`, `items_count`, `line_total`, `orders_count`, `orders_total`, `last_order_at`. `OperatorApi` method names used later: `stages`, `orders`, `order`, `patchOrder`, `replaceItems`, `moveStage`, `logEvent`, `products`, `customers`, `customer`. `beep()` (Task 8) is used only by the board. `stageLabel`/`isActiveOrder` (Task 13) are additions next to the existing `orderStatusLabel`/`isActiveStatus`, which stay for the device history.
