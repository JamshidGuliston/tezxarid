# Tezxarid API Layer (Plan 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Django REST Framework API for Tezxarid — city-scoped catalog endpoints (cities, categories, products with per-city pricing), JWT auth via Telegram `initData`, guest order creation with cross-city integrity enforcement, and the security hardening carried over from Plan 1.

**Architecture:** DRF with SimpleJWT. A small `apps/common` package holds the shared `X-City-Id` resolution helper + a `CityScopedAPIView` base. Each feature app gains `serializers.py`, `views.py`, and `urls.py`; `config/urls.py` mounts them under `/api/`. Order creation validates every line item's `CityProduct` belongs to the request city and computes the total server-side from a price snapshot. Telegram `initData` is verified with HMAC-SHA256 per Telegram's WebApp spec, then exchanged for a JWT pair. CORS is enabled for the Angular dev server only.

**Tech Stack:** Django 6.0, djangorestframework 3.16, djangorestframework-simplejwt 5.4, django-cors-headers, pytest-django. Builds directly on Plan 1 (models already exist).

---

## Conventions for every command

- Repo root: `d:\Projects\Django\Delivery`. Windows / PowerShell.
- venv python: `d:\Projects\Django\Delivery\venv\Scripts\python.exe`. Activate with `.\venv\Scripts\Activate.ps1`.
- Django + pytest commands run from `backend/`.
- Every commit message ends with a blank line then: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Current state: Plan 1 complete. Models `City`, `Category`, `Product`, `CityProduct`, `Order`, `OrderItem`, custom `User` (role/telegram_id/phone/city) all exist with migrations. `rest_framework` is in `INSTALLED_APPS`. SimpleJWT is installed but unconfigured. 10 tests currently pass.

---

## File Structure (created/modified by this plan)

```
backend/
├── requirements.txt                 # + django-cors-headers
├── config/
│   ├── settings/
│   │   ├── base.py                   # REST_FRAMEWORK, SIMPLE_JWT, corsheaders, TELEGRAM_BOT_TOKEN
│   │   └── dev.py                    # CORS_ALLOWED_ORIGINS for :4200
│   └── urls.py                       # mount /api/ + media serving (dev)
└── apps/
    ├── common/                       # NEW package (not a Django app — plain module)
    │   ├── __init__.py
    │   ├── city.py                   # resolve_city() + CityScopedAPIView
    │   └── tests/test_city.py
    ├── cities/
    │   ├── serializers.py            # CitySerializer
    │   ├── views.py                  # CityListView
    │   ├── urls.py
    │   └── test_api.py
    ├── catalog/
    │   ├── serializers.py            # CategorySerializer, CityProductSerializer
    │   ├── views.py                  # CategoryListView, ProductListView
    │   ├── urls.py
    │   └── test_api.py
    ├── users/
    │   ├── telegram.py               # verify_telegram_init_data()
    │   ├── serializers.py            # TelegramAuthSerializer
    │   ├── views.py                  # TelegramAuthView
    │   ├── urls.py
    │   ├── admin.py                  # hardened (carry-over #2)
    │   ├── test_telegram.py
    │   └── test_api.py
    └── orders/
        ├── serializers.py            # OrderItemInputSerializer, OrderCreateSerializer, OrderSerializer
        ├── views.py                  # OrderListCreateView
        ├── urls.py
        └── test_api.py
```

`apps/common` is a plain Python package (no `AppConfig`, not added to `INSTALLED_APPS`) — it holds reusable DRF helpers only.

---

### Task 1: DRF + SimpleJWT + CORS configuration, API URL mount, media serving

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/config/settings/base.py`
- Modify: `backend/config/settings/dev.py`
- Modify: `backend/config/urls.py`
- Test: `backend/apps/common/tests/test_smoke.py` (+ `backend/apps/common/__init__.py`, `backend/apps/common/tests/__init__.py`)

- [ ] **Step 1: Add django-cors-headers to requirements and install**

Append to `backend/requirements.txt`:
```
django-cors-headers==4.9.0
```
Run from repo root: `d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pip install -r backend\requirements.txt`
Expected: "Successfully installed django-cors-headers-4.9.0" (or already satisfied for the rest). If 4.9.0 is unavailable, install the latest 4.x and record the version.

- [ ] **Step 2: Write a smoke test that the API root config loads**

Create `backend/apps/common/__init__.py` (empty), `backend/apps/common/tests/__init__.py` (empty), and `backend/apps/common/tests/test_smoke.py`:
```python
import pytest
from django.urls import reverse


@pytest.mark.django_db
def test_cities_url_is_registered():
    # The /api/cities/ route must resolve once Task 1 mounts the api urls.
    url = reverse('cities:list')
    assert url == '/api/cities/'
```

- [ ] **Step 3: Run the test to verify it fails**

Run from `backend/`: `d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pytest apps/common/tests/test_smoke.py -v`
Expected: FAIL — `NoReverseMatch` (the `cities` urls don't exist yet). This will pass after Task 3 wires the cities urls; for Task 1, accept that this specific test stays red until Task 3 and instead verify Task 1 via Step 6's `manage.py check`. (Mark this test xfail-free; it is the Task 3 acceptance test placed early so the route name is fixed.)

- [ ] **Step 4: Configure DRF, SimpleJWT, CORS, and Telegram token in base.py**

In `backend/config/settings/base.py`, add `'corsheaders'` to `INSTALLED_APPS` (after `'rest_framework'`). Add the corsheaders middleware as the FIRST middleware entry (it must run before CommonMiddleware). The MIDDLEWARE list becomes:
```python
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]
```
At the end of `base.py`, add:
```python
# Django REST Framework
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.AllowAny',
    ),
}

# SimpleJWT
from datetime import timedelta  # noqa: E402

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=12),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),
}

# Telegram bot token used to verify Mini App initData (set in real environments)
TELEGRAM_BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', 'test-bot-token')

# CORS: overridden per-environment. Default deny (same-domain prod).
CORS_ALLOWED_ORIGINS = []
```

- [ ] **Step 5: Enable CORS for the Angular dev server in dev.py**

Append to `backend/config/settings/dev.py`:
```python
CORS_ALLOWED_ORIGINS = [
    'http://localhost:4200',
    'http://127.0.0.1:4200',
]
```

- [ ] **Step 6: Mount /api/ urls and serve media in dev**

Replace the body of `backend/config/urls.py` with:
```python
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/cities/', include('apps.cities.urls')),
    path('api/', include('apps.catalog.urls')),
    path('api/', include('apps.orders.urls')),
    path('api/auth/', include('apps.users.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
```
NOTE: the included `apps.*.urls` modules are created in later tasks. Until then `manage.py check` will fail to import them. To keep Task 1 independently checkable, temporarily comment out the three `apps.catalog`, `apps.orders`, `apps.users` includes AND the `apps.cities` include, leaving only admin + media, run the check, then uncomment as each task adds its urls. Simpler: create empty `urls.py` stubs now — see Step 7.

- [ ] **Step 7: Create empty urls stubs so the project boots**

Create these four files, each containing exactly:
```python
from django.urls import path

app_name = '<APPNAME>'
urlpatterns = []
```
- `backend/apps/cities/urls.py` with `app_name = 'cities'`
- `backend/apps/catalog/urls.py` with `app_name = 'catalog'`
- `backend/apps/orders/urls.py` with `app_name = 'orders'`
- `backend/apps/users/urls.py` with `app_name = 'users'`

- [ ] **Step 8: Verify the project boots**

Run from `backend/`:
```
d:\Projects\Django\Delivery\venv\Scripts\python.exe manage.py check
```
Expected: "System check identified no issues (0 silenced)." (The smoke test from Step 2 will still fail until Task 3 — that is expected and acceptable.)

- [ ] **Step 9: Commit**

```
git add backend/requirements.txt backend/config backend/apps/common backend/apps/cities/urls.py backend/apps/catalog/urls.py backend/apps/orders/urls.py backend/apps/users/urls.py
git commit -m "feat(api): configure DRF, SimpleJWT, CORS; mount /api urls and dev media"
```

---

### Task 2: City resolution helper + CityScopedAPIView

**Files:**
- Create: `backend/apps/common/city.py`
- Test: `backend/apps/common/tests/test_city.py`

- [ ] **Step 1: Write the failing test**

Create `backend/apps/common/tests/test_city.py`:
```python
import pytest
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIRequestFactory
from apps.cities.models import City
from apps.common.city import resolve_city


@pytest.mark.django_db
def test_resolve_city_from_header():
    city = City.objects.create(name='Toshkent', slug='toshkent')
    request = APIRequestFactory().get('/api/products/', HTTP_X_CITY_ID=str(city.id))
    assert resolve_city(request).id == city.id


@pytest.mark.django_db
def test_resolve_city_missing_header_raises():
    request = APIRequestFactory().get('/api/products/')
    with pytest.raises(ValidationError):
        resolve_city(request)


@pytest.mark.django_db
def test_resolve_city_unknown_id_raises():
    request = APIRequestFactory().get('/api/products/', HTTP_X_CITY_ID='999999')
    with pytest.raises(ValidationError):
        resolve_city(request)


@pytest.mark.django_db
def test_resolve_city_inactive_raises():
    city = City.objects.create(name='Eski', slug='eski', is_active=False)
    request = APIRequestFactory().get('/api/products/', HTTP_X_CITY_ID=str(city.id))
    with pytest.raises(ValidationError):
        resolve_city(request)
```

- [ ] **Step 2: Run test to verify it fails**

Run from `backend/`: `d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pytest apps/common/tests/test_city.py -v`
Expected: FAIL — cannot import `resolve_city`.

- [ ] **Step 3: Implement the helper and mixin**

Create `backend/apps/common/city.py`:
```python
from rest_framework.exceptions import ValidationError
from rest_framework.views import APIView
from apps.cities.models import City

CITY_HEADER = 'X-City-Id'


def resolve_city(request):
    """Return the active City named by the X-City-Id header, or raise ValidationError."""
    raw = request.META.get('HTTP_X_CITY_ID')
    if not raw:
        raise ValidationError({'city': f'{CITY_HEADER} header is required.'})
    try:
        city_id = int(raw)
    except (TypeError, ValueError):
        raise ValidationError({'city': f'{CITY_HEADER} must be an integer.'})
    try:
        return City.objects.get(pk=city_id, is_active=True)
    except City.DoesNotExist:
        raise ValidationError({'city': 'Unknown or inactive city.'})


class CityScopedAPIView(APIView):
    """Base view exposing self.city resolved from the X-City-Id header."""

    @property
    def city(self):
        if not hasattr(self, '_city'):
            self._city = resolve_city(self.request)
        return self._city
```

- [ ] **Step 4: Run test to verify it passes**

Run from `backend/`: `d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pytest apps/common/tests/test_city.py -v`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```
git add backend/apps/common/city.py backend/apps/common/tests/test_city.py
git commit -m "feat(api): X-City-Id resolver and CityScopedAPIView base"
```

---

### Task 3: Cities API (public list)

**Files:**
- Create: `backend/apps/cities/serializers.py`
- Create: `backend/apps/cities/views.py`
- Modify: `backend/apps/cities/urls.py`
- Test: `backend/apps/cities/test_api.py`

- [ ] **Step 1: Write the failing test**

Create `backend/apps/cities/test_api.py`:
```python
import pytest
from rest_framework.test import APIClient
from apps.cities.models import City


@pytest.mark.django_db
def test_cities_list_returns_only_active():
    City.objects.create(name='Toshkent', slug='toshkent')
    City.objects.create(name='Eski', slug='eski', is_active=False)

    resp = APIClient().get('/api/cities/')

    assert resp.status_code == 200
    names = [c['name'] for c in resp.json()]
    assert names == ['Toshkent']
    assert set(resp.json()[0].keys()) == {'id', 'name', 'slug'}
```

- [ ] **Step 2: Run test to verify it fails**

Run from `backend/`: `d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pytest apps/cities/test_api.py -v`
Expected: FAIL — 404 (route not wired / view missing).

- [ ] **Step 3: Implement serializer, view, urls**

Create `backend/apps/cities/serializers.py`:
```python
from rest_framework import serializers
from .models import City


class CitySerializer(serializers.ModelSerializer):
    class Meta:
        model = City
        fields = ['id', 'name', 'slug']
```

Create `backend/apps/cities/views.py`:
```python
from rest_framework.generics import ListAPIView
from .models import City
from .serializers import CitySerializer


class CityListView(ListAPIView):
    serializer_class = CitySerializer
    pagination_class = None

    def get_queryset(self):
        return City.objects.filter(is_active=True)
```

Replace `backend/apps/cities/urls.py`:
```python
from django.urls import path
from .views import CityListView

app_name = 'cities'

urlpatterns = [
    path('', CityListView.as_view(), name='list'),
]
```

- [ ] **Step 4: Run tests to verify they pass**

Run from `backend/`:
```
d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pytest apps/cities/test_api.py apps/common/tests/test_smoke.py -v
```
Expected: PASS (the cities api test AND the Task 1 smoke `test_cities_url_is_registered` now pass).

- [ ] **Step 5: Commit**

```
git add backend/apps/cities
git commit -m "feat(api): GET /api/cities/ list endpoint"
```

---

### Task 4: Categories API (public list)

**Files:**
- Create: `backend/apps/catalog/serializers.py`
- Create: `backend/apps/catalog/views.py`
- Modify: `backend/apps/catalog/urls.py`
- Test: `backend/apps/catalog/test_api.py`

- [ ] **Step 1: Write the failing test**

Create `backend/apps/catalog/test_api.py`:
```python
import pytest
from rest_framework.test import APIClient
from apps.cities.models import City
from apps.catalog.models import Category, Product, CityProduct


@pytest.fixture
def city(db):
    return City.objects.create(name='Toshkent', slug='toshkent')


@pytest.mark.django_db
def test_categories_list_returns_active_sorted():
    Category.objects.create(name='Sabzavotlar', sort_order=2)
    Category.objects.create(name='Mevalar', sort_order=1)
    Category.objects.create(name='Yashirin', sort_order=3, is_active=False)

    resp = APIClient().get('/api/categories/')

    assert resp.status_code == 200
    names = [c['name'] for c in resp.json()]
    assert names == ['Mevalar', 'Sabzavotlar']
    assert set(resp.json()[0].keys()) == {'id', 'name', 'image', 'sort_order'}
```

- [ ] **Step 2: Run test to verify it fails**

Run from `backend/`: `d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pytest apps/catalog/test_api.py::test_categories_list_returns_active_sorted -v`
Expected: FAIL — 404.

- [ ] **Step 3: Implement CategorySerializer + CategoryListView + url**

Create `backend/apps/catalog/serializers.py`:
```python
from rest_framework import serializers
from .models import Category, CityProduct


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'image', 'sort_order']


class CityProductSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source='product.id', read_only=True)
    city_product_id = serializers.IntegerField(source='id', read_only=True)
    name = serializers.CharField(source='product.name', read_only=True)
    image = serializers.ImageField(source='product.image', read_only=True)
    unit = serializers.CharField(source='product.unit', read_only=True)
    category = serializers.IntegerField(source='product.category_id', read_only=True)

    class Meta:
        model = CityProduct
        fields = ['id', 'city_product_id', 'name', 'image', 'unit',
                  'category', 'price', 'is_available', 'stock']
```

Create `backend/apps/catalog/views.py`:
```python
from rest_framework.generics import ListAPIView
from .models import Category
from .serializers import CategorySerializer


class CategoryListView(ListAPIView):
    serializer_class = CategorySerializer
    pagination_class = None

    def get_queryset(self):
        return Category.objects.filter(is_active=True)
```

Replace `backend/apps/catalog/urls.py`:
```python
from django.urls import path
from .views import CategoryListView

app_name = 'catalog'

urlpatterns = [
    path('categories/', CategoryListView.as_view(), name='category-list'),
]
```

- [ ] **Step 4: Run test to verify it passes**

Run from `backend/`: `d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pytest apps/catalog/test_api.py::test_categories_list_returns_active_sorted -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add backend/apps/catalog/serializers.py backend/apps/catalog/views.py backend/apps/catalog/urls.py backend/apps/catalog/test_api.py
git commit -m "feat(api): GET /api/categories/ list endpoint"
```

---

### Task 5: Products API (city-scoped, per-city price)

**Files:**
- Modify: `backend/apps/catalog/views.py`
- Modify: `backend/apps/catalog/urls.py`
- Test: `backend/apps/catalog/test_api.py` (add tests)

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/catalog/test_api.py`:
```python
@pytest.fixture
def catalog(city):
    other = City.objects.create(name='Samarqand', slug='samarqand')
    fruits = Category.objects.create(name='Mevalar', sort_order=1)
    grains = Category.objects.create(name='Don', sort_order=2)
    olma = Product.objects.create(name='Olma', unit=Product.Unit.KG, category=fruits)
    un = Product.objects.create(name='Un', unit=Product.Unit.KG, category=grains)
    CityProduct.objects.create(city=city, product=olma, price=19300)
    CityProduct.objects.create(city=city, product=un, price=7600, is_available=False)
    CityProduct.objects.create(city=other, product=olma, price=20000)
    return city, fruits, olma


@pytest.mark.django_db
def test_products_require_city_header(catalog):
    resp = APIClient().get('/api/products/')
    assert resp.status_code == 400


@pytest.mark.django_db
def test_products_list_uses_city_price_and_hides_unavailable(catalog):
    city, fruits, olma = catalog
    resp = APIClient().get('/api/products/', HTTP_X_CITY_ID=str(city.id))
    assert resp.status_code == 200
    body = resp.json()
    # only the available product (Olma) for this city, at this city's price
    assert len(body) == 1
    assert body[0]['name'] == 'Olma'
    assert body[0]['price'] == '19300.00'
    assert body[0]['unit'] == 'kg'


@pytest.mark.django_db
def test_products_filter_by_category(catalog):
    city, fruits, olma = catalog
    resp = APIClient().get(f'/api/products/?category={fruits.id}', HTTP_X_CITY_ID=str(city.id))
    assert resp.status_code == 200
    assert [p['name'] for p in resp.json()] == ['Olma']


@pytest.mark.django_db
def test_products_search_by_name(catalog):
    city, fruits, olma = catalog
    resp = APIClient().get('/api/products/?search=olm', HTTP_X_CITY_ID=str(city.id))
    assert resp.status_code == 200
    assert [p['name'] for p in resp.json()] == ['Olma']
```

- [ ] **Step 2: Run tests to verify they fail**

Run from `backend/`: `d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pytest apps/catalog/test_api.py -v`
Expected: the four new product tests FAIL with 404 (route missing).

- [ ] **Step 3: Implement ProductListView**

Append to `backend/apps/catalog/views.py`:
```python
from apps.common.city import resolve_city
from .models import CityProduct
from .serializers import CityProductSerializer


class ProductListView(ListAPIView):
    serializer_class = CityProductSerializer
    pagination_class = None

    def get_queryset(self):
        city = resolve_city(self.request)
        qs = (CityProduct.objects
              .filter(city=city, is_available=True, product__is_active=True)
              .select_related('product', 'product__category')
              .order_by('product__name'))
        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(product__category_id=category)
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(product__name__icontains=search)
        return qs
```

Add the route to `backend/apps/catalog/urls.py`:
```python
from django.urls import path
from .views import CategoryListView, ProductListView

app_name = 'catalog'

urlpatterns = [
    path('categories/', CategoryListView.as_view(), name='category-list'),
    path('products/', ProductListView.as_view(), name='product-list'),
]
```

- [ ] **Step 4: Run tests to verify they pass**

Run from `backend/`: `d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pytest apps/catalog/test_api.py -v`
Expected: PASS (all category + product tests).

- [ ] **Step 5: Commit**

```
git add backend/apps/catalog
git commit -m "feat(api): GET /api/products/ city-scoped with category filter and search"
```

---

### Task 6: Telegram initData verification + JWT auth endpoint

**Files:**
- Create: `backend/apps/users/telegram.py`
- Create: `backend/apps/users/serializers.py`
- Create: `backend/apps/users/views.py`
- Modify: `backend/apps/users/urls.py`
- Test: `backend/apps/users/test_telegram.py`, `backend/apps/users/test_api.py`

- [ ] **Step 1: Write the failing unit test for initData verification**

Create `backend/apps/users/test_telegram.py`:
```python
import hashlib
import hmac
import json
from urllib.parse import urlencode

import pytest
from apps.users.telegram import verify_telegram_init_data, TelegramAuthError


def build_init_data(bot_token: str, user: dict) -> str:
    """Construct a valid initData query string signed like Telegram does."""
    fields = {'auth_date': '1700000000', 'query_id': 'abc', 'user': json.dumps(user)}
    data_check_string = '\n'.join(f'{k}={fields[k]}' for k in sorted(fields))
    secret_key = hmac.new(b'WebAppData', bot_token.encode(), hashlib.sha256).digest()
    h = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    fields['hash'] = h
    return urlencode(fields)


def test_verify_valid_init_data_returns_user():
    token = 'test-bot-token'
    user = {'id': 12345, 'first_name': 'Aziz', 'username': 'aziz'}
    init_data = build_init_data(token, user)

    result = verify_telegram_init_data(init_data, token)

    assert result['id'] == 12345
    assert result['first_name'] == 'Aziz'


def test_verify_tampered_hash_raises():
    token = 'test-bot-token'
    user = {'id': 12345, 'first_name': 'Aziz'}
    init_data = build_init_data(token, user) + '0'  # corrupt the hash tail

    with pytest.raises(TelegramAuthError):
        verify_telegram_init_data(init_data, token)


def test_verify_wrong_token_raises():
    user = {'id': 1, 'first_name': 'X'}
    init_data = build_init_data('test-bot-token', user)

    with pytest.raises(TelegramAuthError):
        verify_telegram_init_data(init_data, 'different-token')
```

- [ ] **Step 2: Run to verify it fails**

Run from `backend/`: `d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pytest apps/users/test_telegram.py -v`
Expected: FAIL — cannot import `verify_telegram_init_data`.

- [ ] **Step 3: Implement the verifier**

Create `backend/apps/users/telegram.py`:
```python
import hashlib
import hmac
import json
from urllib.parse import parse_qsl


class TelegramAuthError(Exception):
    """Raised when Telegram initData fails HMAC verification or is malformed."""


def verify_telegram_init_data(init_data: str, bot_token: str) -> dict:
    """Verify Telegram WebApp initData and return the parsed `user` dict.

    Raises TelegramAuthError on any verification or parsing failure.
    """
    pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = pairs.pop('hash', None)
    if not received_hash:
        raise TelegramAuthError('Missing hash in initData.')

    data_check_string = '\n'.join(f'{k}={pairs[k]}' for k in sorted(pairs))
    secret_key = hmac.new(b'WebAppData', bot_token.encode(), hashlib.sha256).digest()
    computed = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(computed, received_hash):
        raise TelegramAuthError('initData hash mismatch.')

    user_raw = pairs.get('user')
    if not user_raw:
        raise TelegramAuthError('Missing user in initData.')
    try:
        return json.loads(user_raw)
    except json.JSONDecodeError:
        raise TelegramAuthError('Malformed user payload in initData.')
```

- [ ] **Step 4: Run to verify it passes**

Run from `backend/`: `d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pytest apps/users/test_telegram.py -v`
Expected: PASS (3 passed).

- [ ] **Step 5: Write the failing API test for the auth endpoint**

Create `backend/apps/users/test_api.py`:
```python
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from apps.users.test_telegram import build_init_data

User = get_user_model()


@pytest.mark.django_db
def test_telegram_auth_creates_user_and_returns_tokens(settings):
    settings.TELEGRAM_BOT_TOKEN = 'test-bot-token'
    init_data = build_init_data('test-bot-token', {
        'id': 777, 'first_name': 'Aziz', 'last_name': 'Aliyev', 'username': 'aziz',
    })

    resp = APIClient().post('/api/auth/telegram/', {'init_data': init_data}, format='json')

    assert resp.status_code == 200
    body = resp.json()
    assert 'access' in body and 'refresh' in body
    user = User.objects.get(telegram_id=777)
    assert user.first_name == 'Aziz'


@pytest.mark.django_db
def test_telegram_auth_is_idempotent_for_same_user(settings):
    settings.TELEGRAM_BOT_TOKEN = 'test-bot-token'
    init_data = build_init_data('test-bot-token', {'id': 777, 'first_name': 'Aziz'})
    client = APIClient()

    client.post('/api/auth/telegram/', {'init_data': init_data}, format='json')
    client.post('/api/auth/telegram/', {'init_data': init_data}, format='json')

    assert User.objects.filter(telegram_id=777).count() == 1


@pytest.mark.django_db
def test_telegram_auth_rejects_bad_signature(settings):
    settings.TELEGRAM_BOT_TOKEN = 'test-bot-token'
    init_data = build_init_data('test-bot-token', {'id': 1, 'first_name': 'X'}) + 'tamper'

    resp = APIClient().post('/api/auth/telegram/', {'init_data': init_data}, format='json')

    assert resp.status_code == 400
```

- [ ] **Step 6: Run to verify it fails**

Run from `backend/`: `d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pytest apps/users/test_api.py -v`
Expected: FAIL — 404 (endpoint missing).

- [ ] **Step 7: Implement serializer, view, url**

Create `backend/apps/users/serializers.py`:
```python
from rest_framework import serializers


class TelegramAuthSerializer(serializers.Serializer):
    init_data = serializers.CharField()
```

Create `backend/apps/users/views.py`:
```python
from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import TelegramAuthSerializer
from .telegram import TelegramAuthError, verify_telegram_init_data

User = get_user_model()


class TelegramAuthView(APIView):
    """Exchange verified Telegram initData for a JWT pair (creating the user if new)."""

    def post(self, request):
        serializer = TelegramAuthSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            tg_user = verify_telegram_init_data(
                serializer.validated_data['init_data'],
                settings.TELEGRAM_BOT_TOKEN,
            )
        except TelegramAuthError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        telegram_id = tg_user['id']
        user, _ = User.objects.get_or_create(
            telegram_id=telegram_id,
            defaults={'username': f'tg_{telegram_id}'},
        )
        # Keep profile fields fresh from Telegram.
        user.first_name = tg_user.get('first_name', '')
        user.last_name = tg_user.get('last_name', '')
        user.save(update_fields=['first_name', 'last_name'])

        refresh = RefreshToken.for_user(user)
        return Response({'access': str(refresh.access_token), 'refresh': str(refresh)})
```

Replace `backend/apps/users/urls.py`:
```python
from django.urls import path
from .views import TelegramAuthView

app_name = 'users'

urlpatterns = [
    path('telegram/', TelegramAuthView.as_view(), name='telegram-auth'),
]
```

- [ ] **Step 8: Run tests to verify they pass**

Run from `backend/`: `d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pytest apps/users/test_api.py apps/users/test_telegram.py -v`
Expected: PASS (6 passed).

- [ ] **Step 9: Commit**

```
git add backend/apps/users/telegram.py backend/apps/users/serializers.py backend/apps/users/views.py backend/apps/users/urls.py backend/apps/users/test_telegram.py backend/apps/users/test_api.py
git commit -m "feat(api): Telegram initData verification and JWT auth endpoint"
```

---

### Task 7: Orders API (guest create with cross-city integrity + authed list)

**Files:**
- Create: `backend/apps/orders/serializers.py`
- Create: `backend/apps/orders/views.py`
- Modify: `backend/apps/orders/urls.py`
- Test: `backend/apps/orders/test_api.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/orders/test_api.py`:
```python
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from apps.cities.models import City
from apps.catalog.models import Category, Product, CityProduct
from apps.orders.models import Order

User = get_user_model()


@pytest.fixture
def shop(db):
    tashkent = City.objects.create(name='Toshkent', slug='toshkent')
    samarkand = City.objects.create(name='Samarqand', slug='samarqand')
    cat = Category.objects.create(name='Mevalar')
    olma = Product.objects.create(name='Olma', unit=Product.Unit.KG, category=cat)
    cp_tk = CityProduct.objects.create(city=tashkent, product=olma, price=19300)
    cp_sm = CityProduct.objects.create(city=samarkand, product=olma, price=20000)
    return tashkent, samarkand, cp_tk, cp_sm


@pytest.mark.django_db
def test_create_order_computes_total_server_side(shop):
    tashkent, _, cp_tk, _ = shop
    payload = {
        'customer_name': 'Aziz',
        'phone': '+998901112233',
        'items': [{'city_product': cp_tk.id, 'qty': 2}],
    }
    resp = APIClient().post('/api/orders/', payload, format='json',
                            HTTP_X_CITY_ID=str(tashkent.id))
    assert resp.status_code == 201
    body = resp.json()
    assert body['total'] == '38600.00'
    assert body['status'] == 'new'
    order = Order.objects.get(pk=body['id'])
    assert order.items.count() == 1
    assert order.items.first().price_snapshot == cp_tk.price


@pytest.mark.django_db
def test_create_order_rejects_city_product_from_other_city(shop):
    tashkent, _, _, cp_sm = shop
    payload = {
        'customer_name': 'Aziz',
        'phone': '+998901112233',
        'items': [{'city_product': cp_sm.id, 'qty': 1}],  # Samarkand product, Tashkent order
    }
    resp = APIClient().post('/api/orders/', payload, format='json',
                            HTTP_X_CITY_ID=str(tashkent.id))
    assert resp.status_code == 400
    assert Order.objects.count() == 0


@pytest.mark.django_db
def test_create_order_requires_city_header(shop):
    tashkent, _, cp_tk, _ = shop
    payload = {'customer_name': 'A', 'phone': '+9989', 'items': [{'city_product': cp_tk.id, 'qty': 1}]}
    resp = APIClient().post('/api/orders/', payload, format='json')
    assert resp.status_code == 400


@pytest.mark.django_db
def test_create_order_requires_at_least_one_item(shop):
    tashkent, _, _, _ = shop
    payload = {'customer_name': 'A', 'phone': '+9989', 'items': []}
    resp = APIClient().post('/api/orders/', payload, format='json',
                            HTTP_X_CITY_ID=str(tashkent.id))
    assert resp.status_code == 400


@pytest.mark.django_db
def test_order_list_requires_auth_and_returns_only_own(shop):
    tashkent, _, cp_tk, _ = shop
    owner = User.objects.create_user(username='owner', password='x', telegram_id=1)
    other = User.objects.create_user(username='other', password='x', telegram_id=2)
    Order.objects.create(city=tashkent, user=owner, customer_name='Owner', phone='1', total=10)
    Order.objects.create(city=tashkent, user=other, customer_name='Other', phone='2', total=20)

    anon = APIClient().get('/api/orders/')
    assert anon.status_code == 401

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(owner).access_token}')
    resp = client.get('/api/orders/')
    assert resp.status_code == 200
    assert [o['customer_name'] for o in resp.json()] == ['Owner']
```

- [ ] **Step 2: Run to verify it fails**

Run from `backend/`: `d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pytest apps/orders/test_api.py -v`
Expected: FAIL — 404 (route missing).

- [ ] **Step 3: Implement serializers**

Create `backend/apps/orders/serializers.py`:
```python
from django.db import transaction
from rest_framework import serializers
from apps.catalog.models import CityProduct
from .models import Order, OrderItem


class OrderItemInputSerializer(serializers.Serializer):
    city_product = serializers.PrimaryKeyRelatedField(queryset=CityProduct.objects.all())
    qty = serializers.IntegerField(min_value=1)


class OrderItemSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='city_product.product.name', read_only=True)

    class Meta:
        model = OrderItem
        fields = ['id', 'name', 'qty', 'price_snapshot']


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = ['id', 'city', 'customer_name', 'phone', 'status',
                  'payment_type', 'total', 'created_at', 'items']
        read_only_fields = fields


class OrderCreateSerializer(serializers.Serializer):
    customer_name = serializers.CharField(max_length=120)
    phone = serializers.CharField(max_length=20)
    payment_type = serializers.ChoiceField(
        choices=Order.PaymentType.choices, default=Order.PaymentType.CASH)
    items = OrderItemInputSerializer(many=True)

    def validate_items(self, items):
        if not items:
            raise serializers.ValidationError('At least one item is required.')
        city = self.context['city']
        for item in items:
            if item['city_product'].city_id != city.id:
                raise serializers.ValidationError(
                    'All items must belong to the request city.')
            if not item['city_product'].is_available:
                raise serializers.ValidationError(
                    f"{item['city_product'].product.name} is not available.")
        return items

    @transaction.atomic
    def create(self, validated_data):
        city = self.context['city']
        user = self.context['request'].user
        items = validated_data['items']
        total = sum(i['city_product'].price * i['qty'] for i in items)
        order = Order.objects.create(
            city=city,
            user=user if user.is_authenticated else None,
            customer_name=validated_data['customer_name'],
            phone=validated_data['phone'],
            payment_type=validated_data['payment_type'],
            total=total,
        )
        OrderItem.objects.bulk_create([
            OrderItem(order=order, city_product=i['city_product'],
                      qty=i['qty'], price_snapshot=i['city_product'].price)
            for i in items
        ])
        return order
```

- [ ] **Step 4: Implement the view + url**

Create `backend/apps/orders/views.py`:
```python
from rest_framework import status
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from apps.common.city import CityScopedAPIView
from .models import Order
from .serializers import OrderCreateSerializer, OrderSerializer


class OrderListCreateView(CityScopedAPIView):
    """POST creates a guest/authed order (needs X-City-Id); GET lists the caller's own orders (needs JWT)."""

    def post(self, request):
        serializer = OrderCreateSerializer(
            data=request.data, context={'request': request, 'city': self.city})
        serializer.is_valid(raise_exception=True)
        order = serializer.save()
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)

    def get(self, request):
        if not request.user.is_authenticated:
            return Response({'detail': 'Authentication required.'},
                            status=status.HTTP_401_UNAUTHORIZED)
        orders = (Order.objects.filter(user=request.user)
                  .prefetch_related('items', 'items__city_product__product'))
        return Response(OrderSerializer(orders, many=True).data)
```

Replace `backend/apps/orders/urls.py`:
```python
from django.urls import path
from .views import OrderListCreateView

app_name = 'orders'

urlpatterns = [
    path('orders/', OrderListCreateView.as_view(), name='list-create'),
]
```

NOTE: the GET branch intentionally returns 401 for anonymous callers itself (rather than via a permission class) because POST on the same view must stay public. The test `test_order_list_requires_auth_and_returns_only_own` asserts this 401.

- [ ] **Step 5: Run tests to verify they pass**

Run from `backend/`: `d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pytest apps/orders/test_api.py -v`
Expected: PASS (5 passed).

- [ ] **Step 6: Commit**

```
git add backend/apps/orders/serializers.py backend/apps/orders/views.py backend/apps/orders/urls.py backend/apps/orders/test_api.py
git commit -m "feat(api): order create (guest, cross-city safe, server total) and authed list"
```

---

### Task 8: UserAdmin hardening (Plan 1 carry-over #2)

**Files:**
- Modify: `backend/apps/users/admin.py`
- Test: `backend/apps/users/test_admin.py`

- [ ] **Step 1: Write the failing test**

Create `backend/apps/users/test_admin.py`:
```python
import pytest
from django.contrib.admin.sites import AdminSite
from django.test import RequestFactory
from django.contrib.auth import get_user_model
from apps.cities.models import City
from apps.users.admin import UserAdmin

User = get_user_model()


@pytest.mark.django_db
def test_city_admin_cannot_edit_privilege_fields():
    city = City.objects.create(name='Toshkent', slug='toshkent')
    staff = User.objects.create_user(
        username='cadmin', password='x', is_staff=True,
        role=User.Role.CITY_ADMIN, city=city)
    ma = UserAdmin(User, AdminSite())
    request = RequestFactory().get('/admin/')
    request.user = staff

    readonly = ma.get_readonly_fields(request)
    assert 'role' in readonly
    assert 'is_superuser' in readonly
    assert 'is_staff' in readonly


@pytest.mark.django_db
def test_superadmin_can_edit_privilege_fields():
    boss = User.objects.create_superuser(username='boss', password='x')
    ma = UserAdmin(User, AdminSite())
    request = RequestFactory().get('/admin/')
    request.user = boss

    readonly = ma.get_readonly_fields(request)
    assert 'role' not in readonly
    assert 'is_superuser' not in readonly
```

- [ ] **Step 2: Run to verify it fails**

Run from `backend/`: `d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pytest apps/users/test_admin.py -v`
Expected: FAIL — `get_readonly_fields` not overridden (role not in readonly).

- [ ] **Step 3: Harden UserAdmin**

Replace `backend/apps/users/admin.py`:
```python
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User

PRIVILEGE_FIELDS = ('role', 'is_superuser', 'is_staff', 'user_permissions', 'groups')


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Tezxarid', {'fields': ('role', 'telegram_id', 'phone', 'city')}),
    )
    list_display = ['username', 'role', 'city', 'phone', 'is_staff']
    list_filter = ['role', 'city', 'is_staff']

    def _is_super(self, user):
        return user.is_superuser or getattr(user, 'role', None) == User.Role.SUPERADMIN

    def get_readonly_fields(self, request, obj=None):
        readonly = super().get_readonly_fields(request, obj)
        if not self._is_super(request.user):
            readonly = tuple(readonly) + PRIVILEGE_FIELDS
        return readonly

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if self._is_super(request.user):
            return qs
        if getattr(request.user, 'role', None) == User.Role.CITY_ADMIN and request.user.city_id:
            return qs.filter(city_id=request.user.city_id)
        return qs.none()
```

- [ ] **Step 4: Run to verify it passes**

Run from `backend/`: `d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pytest apps/users/test_admin.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```
git add backend/apps/users/admin.py backend/apps/users/test_admin.py
git commit -m "fix(admin): non-superadmin cannot edit privilege fields or see other-city users"
```

---

### Task 9: Full-suite verification + manual API smoke

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite**

Run from `backend/`: `d:\Projects\Django\Delivery\venv\Scripts\python.exe -m pytest -v`
Expected: ALL pass (10 from Plan 1 + the new API/admin/telegram tests). Report the total count.

- [ ] **Step 2: System check + migration sync check**

Run from `backend/`:
```
d:\Projects\Django\Delivery\venv\Scripts\python.exe manage.py check
d:\Projects\Django\Delivery\venv\Scripts\python.exe manage.py makemigrations --check --dry-run
```
Expected: 0 issues; "No changes detected" (no model changes in Plan 2).

- [ ] **Step 3: Manual smoke (optional but recommended)**

Run from `backend/`: `d:\Projects\Django\Delivery\venv\Scripts\python.exe manage.py runserver`. In a second shell, create a city + category + product + city_product via Django admin or shell, then:
```
curl http://localhost:8000/api/cities/
curl -H "X-City-Id: 1" http://localhost:8000/api/products/
```
Confirm JSON responses. Stop the server.

- [ ] **Step 4: Commit (if any smoke fixtures/notes were added; otherwise skip)**

No commit needed if nothing changed.

---

## Self-Review

**Spec coverage (design §4.2 API table):**
- GET /api/cities/ → Task 3 ✓
- GET /api/categories/ → Task 4 ✓
- GET /api/products/?category=&search= (X-City-Id) → Task 5 ✓
- POST /api/orders/ (X-City-Id) → Task 7 ✓
- GET /api/orders/ (JWT) → Task 7 ✓
- POST /api/auth/telegram/ → Task 6 ✓
- X-City-Id required on catalog/order endpoints → Task 2 helper + Tasks 5/7 ✓
- Backend returns city price via CityProduct → Task 5 ✓
- Plan 1 carry-over #2 (UserAdmin escalation/scoping) → Task 8 ✓
- Plan 1 carry-over #3 (media serving in dev) → Task 1 Step 6 ✓
- Plan 1 carry-over #2 cross-city order integrity → Task 7 `validate_items` ✓
- CORS for Angular dev server → Task 1 Steps 4–5 ✓

**Placeholder scan:** No TBD/TODO. Every code step shows complete code. Task 1 Step 3 explicitly documents that the smoke test stays red until Task 3 (acceptance test placed early to fix the route name) — this is intentional, not a placeholder.

**Type consistency:**
- `resolve_city(request)` signature is identical in `apps/common/city.py`, its tests, and the catalog/orders views that import it.
- `CityScopedAPIView.city` property used by `OrderListCreateView`.
- Serializer field `city_product` (input) ↔ model FK `OrderItem.city_product` ↔ `CityProduct` PK — consistent.
- `Order.PaymentType.choices` referenced in `OrderCreateSerializer` matches the model from Plan 1.
- `User.Role.SUPERADMIN` / `User.Role.CITY_ADMIN` enum usage in Task 8 matches the Plan 1 model.
- Price assertions use Django's `DecimalField` string form (`'38600.00'`, `'19300.00'`) — consistent with `max_digits=12, decimal_places=2`.

**Note on Task 1 ↔ Task 3 ordering:** The smoke test `test_cities_url_is_registered` is written in Task 1 but only goes green in Task 3 (when the cities urls are wired). Under subagent-driven execution, do not treat its red state at end of Task 1 as a failure — Task 1's acceptance is `manage.py check` passing. This is called out inline in Task 1 Step 3 and Task 3 Step 4.
