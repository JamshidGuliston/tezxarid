# Tezxarid — production deploy (qo'lda, bitta server)

Sxema (spec §3): `nginx` → `/api` va `/admin` → Django (gunicorn, 127.0.0.1:8000); `/static/` → `STATIC_ROOT`; `/media/` → `MEDIA_ROOT`; qolgan hamma narsa → Angular statik build (`index.html` fallback bilan). Ma'lumotlar bazasi — PostgreSQL.

## 1. Backend

Talablar: Python 3.12+, PostgreSQL 14+ (baza va foydalanuvchi yaratilgan).

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
```

Muhit o'zgaruvchilari (masalan `/etc/tezxarid.env`, systemd `EnvironmentFile=`):

| O'zgaruvchi | Majburiy | Izoh |
|---|---|---|
| `DJANGO_SETTINGS_MODULE` | ha | `config.settings.prod` |
| `DJANGO_SECRET_KEY` | ha | uzun tasodifiy satr |
| `TELEGRAM_BOT_TOKEN` | ha | BotFather tokeni (Telegram auth 3c da; hozir ham talab qilinadi) |
| `DJANGO_ALLOWED_HOSTS` | yo'q | default `tezxarid.uz,www.tezxarid.uz` |
| `DB_NAME` `DB_USER` `DB_PASSWORD` `DB_HOST` `DB_PORT` | ha | default host `db`, port `5432` |
| `DJANGO_STATIC_ROOT` / `DJANGO_MEDIA_ROOT` | yo'q | default `backend/staticfiles` va `backend/media` |
| `DJANGO_SECURE_SSL_REDIRECT` | yo'q | default `1`. HTTPS'siz sinov uchun `0` |
| `DJANGO_CORS_ALLOWED_ORIGINS` | yo'q | faqat frontend boshqa domenda bo'lsa (vergul bilan) |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | yo'q | default `https://<har bir ALLOWED_HOST>` |

Birinchi ishga tushirish:

```bash
python manage.py check --deploy
python manage.py migrate
python manage.py collectstatic --noinput
python manage.py createsuperuser
gunicorn config.wsgi:application --bind 127.0.0.1:8000 --workers 3
```

Admin (`/admin/`) orqali to'ldiring: **Cities** (kamida bitta faol shahar) → **Categories** → **Products** → **City products** (narx, mavjudlik) → **Delivery slots** (har shahar uchun 2–4 ta oraliq, masalan 09–12, 12–15, 16–19, 19–22). Oraliq bo'lmasa checkout "Bu shaharda yetkazish vaqtlari hali sozlanmagan" deb turadi. Shahar admini uchun foydalanuvchi: `is_staff`, `role = city_admin`, `city` to'ldirilgan, `orders`/`catalog` ruxsatlari berilgan.

## 2. Frontend

Talab: Node 22.

```bash
cd frontend
npm ci
npx ng build            # production konfiguratsiya default; apiUrl = https://tezxarid.uz/api
# natija: frontend/dist/frontend/browser/
```

API manzili `src/environments/environment.prod.ts` da. Boshqa domen kerak bo'lsa shu faylni o'zgartirib qayta build qiling.

## 3. nginx (namuna)

```nginx
server {
    listen 443 ssl http2;
    server_name tezxarid.uz www.tezxarid.uz;
    # ssl_certificate ... (certbot)

    root /srv/tezxarid/frontend/dist/frontend/browser;
    index index.html;
    client_max_body_size 10m;

    location /api/   { proxy_pass http://127.0.0.1:8000; include /etc/nginx/proxy_params; proxy_set_header X-Forwarded-Proto $scheme; }
    location /admin/ { proxy_pass http://127.0.0.1:8000; include /etc/nginx/proxy_params; proxy_set_header X-Forwarded-Proto $scheme; }
    location /static/ { alias /srv/tezxarid/backend/staticfiles/; expires 30d; }
    location /media/  { alias /srv/tezxarid/backend/media/;       expires 30d; }

    location / { try_files $uri $uri/ /index.html; }
}
server { listen 80; server_name tezxarid.uz www.tezxarid.uz; return 301 https://$host$request_uri; }
```

`X-Forwarded-Proto` majburiy: `SECURE_PROXY_SSL_HEADER` shunga tayanadi. Telegram Web (web.telegram.org) Mini App'ni iframe'da ochadi — SPA javoblariga `X-Frame-Options: DENY` qo'ymang (Django faqat `/api` va `/admin` uchun javob beradi, bu ularga ta'sir qilmaydi).

## 4. Deploy'dan keyingi tekshiruv

1. `https://tezxarid.uz/api/cities/` — faol shaharlar ro'yxati.
2. `https://tezxarid.uz/api/delivery-slots/` (`X-City-Id: <id>` sarlavhasi bilan) — 7 kunlik ro'yxat.
3. Saytda: kategoriya → `+` → savat → "Buyurtma berish" → kun/oraliq → ism, telefon, manzil → yuborish → "Buyurtma qabul qilindi"; adminda buyurtma sana va oraliq bilan ko'rinadi.
4. Mobil kenglikda: pastki navigatsiya, suzuvchi savat, checkout tugmasi nav ustida.

## 5. Yangilash

```bash
git pull
cd backend && source venv/bin/activate && pip install -r requirements.txt && python manage.py migrate && python manage.py collectstatic --noinput && sudo systemctl restart tezxarid
cd ../frontend && npm ci && npx ng build && sudo systemctl reload nginx
```
