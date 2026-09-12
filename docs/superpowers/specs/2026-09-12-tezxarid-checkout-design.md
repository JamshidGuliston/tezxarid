# Tezxarid Checkout — Dizayn (Plan 3b)

**Sana:** 2026-09-12
**Brend:** Tezxarid
**Tur:** Savat → buyurtma berish oqimi (Angular 21 frontend + Django/DRF backend qo'shimchalari)
**Asos:** `2026-06-07-tezxarid-frontend-design.md` (Plan 3) va Plan 3a natijalari

---

## 1. Maqsad va doira

Foydalanuvchi savatdagi mahsulotlarni **ikki ekranda** buyurtma qiladi:

```
Savat  →  Ma'lumotlar (/checkout)  →  Qabul qilindi (/checkout/success)
```

Ma'lumotnoma (Telegram Mini App skrinshotlari) darajasidagi soddalik: ro'yxatdan o'tish yo'q, bitta forma, bitta tugma.

**3b doirasida:**
- Yetkazish **kuni** va **vaqt oralig'i** tanlash (majburiy). Oraliqlar har shahar uchun adminda sozlanadi.
- Mehmon rejimi: ism + telefon, brauzerda eslab qolinadi.
- Manzil matn + "Joylashuvni aniqlash" (brauzer geolokatsiyasi, ixtiyoriy).
- Kuryerga izoh (tayyor chiplar + matn, ixtiyoriy).
- To'lov: faqat naqd. Ekranda tanlov ko'rsatilmaydi, `payment_type=cash` yuboriladi.
- Savat sahifasi: "Tozalash", har qatorda o'chirish va rasm.
- Plan 3a qoldiqlari (bo'lim 6).
- Yozuvlar lotinga o'tadi: "14 900 so'm", "1 kg".

**Doiradan tashqari (keyingi rejalar):**
- Yetkazish narxi — hududlar (zona) modeli bilan keyin. Hozir buyurtma jami = mahsulotlar yig'indisi.
- Keshbek, servis/qadoqlash haqlari.
- Online to'lov (Payme/Click).
- Telegram auth, MainButton, kontakt/lokatsiya so'rovi, saqlangan manzillar UI, buyurtmalar tarixi — 3c.
- Qidiruv — 3d.
- Xarita bilan manzil tanlash.
- Ko'p darajali kategoriyalar (`Category.parent`) — alohida reja; hozirgi tuzilma bunga to'sqinlik qilmaydi.

---

## 2. Qarorlar

| Mavzu | Qaror |
|---|---|
| Oqim | Ikki ekran: `/checkout` (hammasi bitta sahifada) → `/checkout/success` |
| Vaqt oraliqlari | `DeliverySlot` modeli, shahar bo'yicha, admin sozlaydi; `GET /api/delivery-slots/` |
| Kunlar ufqi | Bugun + keyingi 6 kun = 7 kun (`DELIVERY_DAYS_AHEAD = 7`) |
| Bugungi cutoff | Har oraliqda `lead_minutes` (default 120): `now + lead <= start` bo'lsa ochiq |
| Vaqt zonasi | Server `TIME_ZONE = 'Asia/Tashkent'` (`USE_TZ = True` qoladi) |
| Auth | Mehmon (ism + telefon). JWT bo'lsa buyurtma foydalanuvchiga bog'lanadi (backend allaqachon shunday) |
| Telefon | Frontend `+998XXXXXXXXX` ga normallashtiradi; backend `^\+?\d{9,15}$` tekshiradi |
| Manzil | Matn (majburiy) + geolokatsiya lat/lng (ixtiyoriy) |
| To'lov | `cash`, UI'da tanlov yo'q |
| Buyurtma snapshot | `delivery_start/end` buyurtmaga ko'chiriladi; admin oraliqni o'zgartirsa buyurtma o'zgarmaydi |
| Holat saqlash | `CustomerStore` (localStorage), `OrderStore.lastOrder` (faqat xotira) |
| Valyuta/birlik yozuvi | "so'm", "kg", "dona", "l", "g", "bog'lam" |

---

## 3. Backend

### 3.1 `DeliverySlot` modeli (`apps/orders/models.py`)

| Maydon | Tur | Izoh |
|---|---|---|
| `city` | FK `cities.City`, CASCADE, `related_name='delivery_slots'` | |
| `start_time` | TimeField | |
| `end_time` | TimeField | |
| `lead_minutes` | PositiveIntegerField, default 120 | Bugungi kun uchun minimal tayyorlash vaqti |
| `is_active` | BooleanField, default True | |

- `Meta.ordering = ['city_id', 'start_time']`
- `CheckConstraint`: `end_time > start_time`
- Yarim tundan o'tuvchi oraliqlar (masalan 22:00–01:00) qo'llab-quvvatlanmaydi — `end_time > start_time` sharti ataylab.
- `UniqueConstraint`: `(city, start_time, end_time)`
- `__str__`: `"Toshkent 16:00–19:00"`

### 3.2 `Order` qo'shimcha maydonlari

| Maydon | Tur | Izoh |
|---|---|---|
| `delivery_date` | DateField, null/blank | |
| `delivery_slot` | FK `DeliverySlot`, null/blank, SET_NULL, `related_name='orders'` | Havola |
| `delivery_start` | TimeField, null/blank | Snapshot |
| `delivery_end` | TimeField, null/blank | Snapshot |

Bazada nullable (mavjud yozuvlar uchun migratsiya oson), lekin API orqali yaratishda **majburiy**.

### 3.3 Sozlamalar (`config/settings/base.py`)

```python
TIME_ZONE = 'Asia/Tashkent'
DELIVERY_DAYS_AHEAD = 7   # bugun + 6 kun
```

Eslatma: `TIME_ZONE` o'zgargani uchun API javoblaridagi `created_at` endi `+05:00` ofset bilan qaytadi (`...Z` emas); frontend ISO-8601 sifatida o'qiydi.

### 3.4 `GET /api/delivery-slots/`

- `CityScopedAPIView` (`X-City-Id` yo'q bo'lsa mavjud xatti-harakat: 400).
- Auth talab qilinmaydi.
- Faqat `is_active=True` oraliqlar. Har doim 7 kun qaytariladi; oraliqsiz kun bo'sh ro'yxat bilan.
- `now = timezone.localtime()`. `available`: bugun uchun `now + lead_minutes <= start_time` (bugungi sanada), boshqa kunlar uchun `true`.

```json
[
  { "date": "2026-09-12",
    "slots": [
      { "id": 3, "start": "16:00", "end": "19:00", "available": false },
      { "id": 4, "start": "19:00", "end": "22:00", "available": true }
    ] },
  { "date": "2026-09-13", "slots": [ ... ] }
]
```

Vaqtlar `HH:MM` satr, sana ISO `YYYY-MM-DD`.

### 3.5 `POST /api/orders/` o'zgarishlari (`OrderCreateSerializer`)

Yangi majburiy kirish maydonlari: `delivery_date` (date), `delivery_slot_id` (int).

Tekshiruvlar (`validate`), xato kalitlari:
- `delivery_slot_id`: oraliq topilmasa / boshqa shaharniki / nofaol → `"Delivery slot not available."`
- `delivery_date`: `today <= date <= today + 6` bo'lmasa → `"Delivery date out of range."`
- `delivery_slot_id`: `date == today` va `now + lead > start` → `"Delivery slot closed for today."`
- `phone`: `RegexValidator(r'^\+?\d{9,15}$')` → `"Enter a valid phone number."`

Xato matnlari ingliz tilida (mavjud API uslubi); foydalanuvchiga ko'rsatiladigan o'zbekcha matn frontendda kalit bo'yicha tanlanadi.

`create()`: `delivery_slot`, `delivery_date` va snapshot `delivery_start/end` yoziladi.

`OrderSerializer` (javob) ga qo'shiladi: `delivery_date`, `delivery_start`, `delivery_end` (read-only).

### 3.6 Admin

- `DeliverySlotAdmin(CityScopedAdmin)`: `list_display = ['city', 'start_time', 'end_time', 'lead_minutes', 'is_active']`, `list_filter = ['city', 'is_active']`, `list_editable = ['is_active']`.
- `CityScopedAdmin` ga **maqsadli yaxshilanish**: global admin (superuser yoki `SUPERADMIN` roli) bo'lmagan har qanday xodim uchun `city` tanlovi `user.city_id` bilan cheklanadi (shahar yo'q bo'lsa tanlov bo'sh); `ModelChoiceField` shu queryset bo'yicha tekshirgani uchun qo'lda yuborilgan begona shahar ham rad etiladi. `CityProductAdmin` va `OrderAdmin` ham avtomatik foyda ko'radi.
- `OrderAdmin`: `list_display` ga `delivery_date`, `delivery_window` (metod: `"16:00–19:00"`); `list_filter` ga `delivery_date`; `readonly_fields` ga `delivery_start`, `delivery_end`; shahar admini uchun `delivery_slot`, `address_ref` va inline `city_product` tanlovlari ham o'z shahri bilan cheklanadi; `save_model` tanlangan oraliqdan `delivery_start/end` snapshotini yangilaydi.

### 3.7 Backend testlar (pytest)

- Slots API: shahar bo'yicha filtr; nofaol ko'rinmaydi; 7 kun qaytadi; bugungi o'tgan oraliq `available=false` (`timezone.now` mock yoki `freezegun`); `X-City-Id` yo'q → 400.
- Order create: muvaffaqiyat (sana + snapshot saqlanadi); boshqa shahar oralig'i → 400; nofaol → 400; o'tgan sana → 400; 7 kundan keyin → 400; bugun cutoff'dan keyin → 400; `delivery_*` yo'q → 400; noto'g'ri telefon → 400.
- Admin: `city_admin` uchun FK tanlovi o'z shahri bilan cheklangan.

---

## 4. Frontend

### 4.1 Fayl tuzilmasi (yangi va o'zgargan)

```
frontend/src/app/
├── core/
│   ├── api/
│   │   ├── orders-api.ts                    # YANGI: getDeliverySlots(), createOrder(payload)
│   │   └── models/order.models.ts           # YANGI: DeliveryDay, DeliverySlot, OrderCreatePayload, Order, OrderItem
│   ├── customer/customer.store.ts           # YANGI: name/phone/address/lat/lng signallari, localStorage 'tezxarid.customer'
│   ├── orders/order.store.ts                # YANGI: lastOrder = signal<Order|null> (faqat xotira)
│   ├── guards/cart-not-empty.guard.ts       # YANGI: savat bo'sh → '/'
│   └── city/city.service.ts                 # o'zgarmaydi; init() APP_INITIALIZER'dan chaqiriladi
├── shared/
│   ├── utils/units.ts                       # YANGI: UNIT_LABELS (lotin) + unitLabel()
│   ├── pipes/sum.pipe.ts                    # "so'm"
│   └── ui/
│       ├── delivery-picker/                 # YANGI: kun chiplari + oraliq kartochkalari
│       ├── phone-input/                     # YANGI: +998 maskali kiritish
│       ├── cart-panel/                      # Tozalash, o'chirish, rasm, "Buyurtma berish" → /checkout
│       ├── bottom-nav/                      # Qidiruv/Buyurtmalar/Profil o'chiq (3c/3d gacha)
│       ├── product-card/ , qty-stepper/     # units.ts dan foydalanadi
├── features/checkout/
│   ├── checkout.ts                          # YANGI: Ma'lumotlar sahifasi
│   └── order-success.ts                     # YANGI: Qabul qilindi sahifasi
├── layout/shell/shell.ts                    # city.init() olib tashlanadi; faqat kategoriyalar
├── app.config.ts                            # provideAppInitializer(() => inject(CityService).init())
└── app.routes.ts                            # /checkout (guard), /checkout/success
```

### 4.2 Modellar (`order.models.ts`)

```ts
export interface DeliverySlot { id: number; start: string; end: string; available: boolean; }
export interface DeliveryDay  { date: string; slots: DeliverySlot[]; }

export interface OrderCreatePayload {
  customer_name: string;
  phone: string;                 // '+998XXXXXXXXX'
  address: string;
  latitude?: number; longitude?: number;
  comment: string;
  payment_type: 'cash';
  delivery_date: string;         // 'YYYY-MM-DD'
  delivery_slot_id: number;
  items: { city_product: number; qty: string }[];   // qty: 3 kasrgacha satr
}

export interface OrderItem { id: number; name: string; unit: string; qty: string; price_snapshot: string; }
export interface Order {
  id: number; city: number; customer_name: string; phone: string; address: string;
  latitude: string | null; longitude: string | null; comment: string;
  status: string; payment_type: string; total: string; created_at: string;
  delivery_date: string; delivery_start: string; delivery_end: string;
  items: OrderItem[];
}
```

### 4.3 Servislar va storelar

- **`OrdersApi`**: `getDeliverySlots(): Observable<DeliveryDay[]>` → `GET {apiUrl}/delivery-slots/`; `createOrder(p): Observable<Order>` → `POST {apiUrl}/orders/`. `X-City-Id` interceptor orqali.
- **`CustomerStore`**: `name`, `phone`, `address`, `latitude`, `longitude` signallari; `save(partial)`; `effect` orqali localStorage. 3c'da Telegram'dan to'ldiriladi.
- **`OrderStore`**: `lastOrder` signal. Success sahifasi shundan o'qiydi; sahifa qayta yuklansa `null` → `/` ga qaytadi.
- **`cartNotEmptyGuard`** (`CanActivateFn`): `CartStore.count() === 0` → `router.createUrlTree(['/'])`.

### 4.4 Checkout sahifasi (`/checkout`)

Yuqoridan pastga bitta scroll:

1. **Yetkazish kuni** — gorizontal chiplar. Har chip: hafta kuni qisqartmasi (Du, Se, Cho, Pa, Ju, Sha, Ya) va sana raqami; bugungi chip "Bugun" deb yoziladi. Default: birinchi `available` oralig'i bor kun.
2. **Yetkazish vaqti** — tanlangan kunning oraliqlari kartochka ko'rinishida (`16:00 – 19:00`). `available=false` → o'chiq (kulrang, bosilmaydi). Default tanlanmagan; foydalanuvchi bosishi shart.
3. **Ma'lumotlaringiz** — Ism (min 2 belgi), Telefon (`phone-input`, `+998` prefiks, 9 raqam), Manzil (matn, min 5 belgi) + "Joylashuvni aniqlash" tugmasi. Geolokatsiya muvaffaqiyatli bo'lsa "Joylashuv aniqlandi ✓", xato bo'lsa "Joylashuv aniqlanmadi, manzilni qo'lda kiriting" (manzil baribir majburiy).
4. **Kuryerga izoh** (ixtiyoriy) — chiplar "Qo'ng'iroq qiling", "Eshik oldiga qoldiring" (bosilsa matnga qo'shiladi, takror qo'shilmaydi) + textarea.
5. **Jami** — `Mahsulotlar` qatori va `Jami` (hozir teng; keyin yetkazish narxi qatori qo'shiladi).
6. **Pastki yopishqoq tugma** (mobil: `position: sticky; bottom`), holatlar:
   - oraliq tanlanmagan → `Yetkazish vaqtini tanlang` (o'chiq)
   - oraliq bor, forma noto'g'ri → `Ma'lumotlarni to'ldiring` (o'chiq)
   - hammasi to'g'ri → `Buyurtma berish · 14 900 so'm`
   - yuborilmoqda → spinner, o'chiq

Forma: Angular Reactive Forms (`@angular/forms` allaqachon o'rnatilgan). Boshlang'ich qiymatlar `CustomerStore`dan.

**Yuborish:** payload 4.2 bo'yicha, `qty` → `String(qty)` (CartStore allaqachon 3 kasrgacha yaxlitlaydi). Muvaffaqiyat (201): `OrderStore.lastOrder.set(order)`, `CustomerStore.save({name, phone, address, lat, lng})`, `CartStore.clear()`, `router.navigate(['/checkout/success'])`.

**Desktop:** checkout markaziy ustunda (`max-width: 640px`), o'ng savat paneli o'z joyida qoladi; yuborilgach panel bo'shaydi.

### 4.5 Success sahifasi (`/checkout/success`)

- `lastOrder` yo'q → `/` ga redirect.
- Mazmun: belgi ✓, "Buyurtma qabul qilindi", `№ {id}`, "Yetkazish: {sana}, {start} – {end}", "Jami: {total | sum}", "To'lov: naqd", tugma "Bosh sahifaga".

### 4.6 Savat o'zgarishlari (`cart-panel`)

- Sarlavha: `Savat · N ta mahsulot` va o'ngda `Tozalash` (bo'sh bo'lsa ko'rinmaydi; bosilsa `cart.clear()`, tasdiq oynasisiz — savat lokal, qaytarish oson).
- Har qator: rasm (48px, yo'q bo'lsa placeholder fon), nom, narx, stepper, o'chirish belgisi (`cart.remove`).
- `Buyurtma berish →` tugmasi `routerLink="/checkout"`. Bu panel desktopda o'ng ustunda va mobilda `/cart` sahifasida bir xil ishlatiladi.

### 4.7 Xatoliklar

| Holat | Xatti-harakat |
|---|---|
| Slotlar yuklanmadi | Picker o'rnida "Yetkazish vaqtlari yuklanmadi" + `Qayta urinish` |
| Shaharda oraliq yo'q (hammasi bo'sh) | "Bu shaharda yetkazish vaqtlari hali sozlanmagan"; tugma o'chiq |
| 400 `items` | Banner: "Ba'zi mahsulotlar hozir mavjud emas. Savatni tekshiring." Savat saqlanadi |
| 400 `delivery_slot_id` / `delivery_date` | Slotlar qayta yuklanadi, tanlov tozalanadi, banner: "Tanlangan vaqt endi mavjud emas, boshqa vaqtni tanlang." |
| 400 `phone` / `customer_name` / `address` | Maydon ostida xato matni |
| Tarmoq / 5xx | Banner: "Buyurtma yuborilmadi. Internetni tekshirib qayta urinib ko'ring." Tugma yana faol |
| Geolokatsiya rad etildi | Yumshoq matn, oqim to'xtamaydi |

`error.interceptor` konsolga yozishda davom etadi; foydalanuvchi xabari komponentda.

### 4.8 Yozuvlar

- `SumPipe`: `"14 900 so'm"` (testlar yangilanadi).
- `shared/utils/units.ts`: `kg→"kg"`, `sht→"dona"`, `l→"l"`, `g→"g"`, `boglam→"bog'lam"`; `product-card` va `qty-stepper` shu fayldan oladi (dublikat yo'qoladi).

### 4.9 Frontend testlar (Vitest)

- `OrdersApi`: to'g'ri URL va metod; `createOrder` body.
- `CustomerStore`: saqlash/tiklash.
- `DeliveryPicker`: kunlar chiqadi; `available=false` o'chiq; tanlov emit qilinadi; default kun = birinchi ochiq oraliqli kun.
- `PhoneInput`: `901234567` → `+998901234567`; noto'g'ri uzunlik → invalid.
- `cartNotEmptyGuard`: bo'sh savat → `/` UrlTree; bo'sh emas → `true`.
- `Checkout`: 201 da payload to'g'ri (items, slot, sana, `payment_type: 'cash'`), savat tozalanadi, success'ga o'tadi; 400 `items` da banner va savat saqlanadi; oraliq tanlanmaguncha tugma o'chiq.
- `OrderSuccess`: `lastOrder` yo'q → redirect; bor → raqam va sana ko'rinadi.
- `CartPanel`: Tozalash va o'chirish ishlaydi; "Buyurtma berish" `/checkout` ga havola.
- `SumPipe`, `units` yangilangan yozuvlar.
- `Shell`/`App` speclari: cities so'rovi endi initializer orqali (`TestBed` da `provideAppInitializer` bilan yoki initializer'siz shell testi).

---

## 5. Ma'lumot oqimi

```
/checkout ochildi
  ├─ guard: cart bo'sh? → '/'
  ├─ OrdersApi.getDeliverySlots()  (X-City-Id)  → DeliveryPicker
  └─ CustomerStore → forma boshlang'ich qiymatlari

Foydalanuvchi: kun → oraliq → (ism/telefon/manzil) → [Buyurtma berish]
  └─ OrdersApi.createOrder(payload)
       ├─ 201 → OrderStore.lastOrder, CustomerStore.save, Cart.clear, → /checkout/success
       └─ 4xx/5xx → 4.7 jadvali
```

---

## 6. Plan 3a qoldiqlari (shu rejada yopiladi)

1. `CityService.init()` → `provideAppInitializer` (`app.config.ts`). `Shell` faqat kategoriyalarni yuklaydi. Init xatosi ushlanadi va loglanadi; ilova baribir render bo'ladi. Shahar so'rovi 8 s bilan chegaralanadi (`timeout`), `index.html`da 'Yuklanmoqda…' placeholder turadi.
2. `UNIT_LABELS` dublikati → `shared/utils/units.ts` (4.8).
3. `bottom-nav`: Qidiruv / Buyurtmalar / Profil `disabled` tugmalar sifatida (havola emas, xira, AA kontrast). 3c/3d ularni `routerLink`ga almashtiradi.
4. "Buyurtma berish" tugmasi ishlaydi (4.6).
5. Kategoriyalarni ikki marta yuklash (`CatalogStore`) — **3d (qidiruv)** ga qoldiriladi, u yerda mahsulot keshi ham kerak bo'ladi.

---

## 7. Kelajak kengaytmalari (dizayn yo'l qo'yadi)

- **Yetkazish narxi:** `Order.delivery_fee` + `DeliveryZone` (shahar, poligon/radius, narx). Checkout "Jami" bloki qatorli ekan, yangi qator qo'shiladi; `total` serverda hisoblanadi.
- **Keshbek:** foydalanuvchi balansi 3c auth'dan keyin.
- **Kategoriya darajalari:** `Category.parent` (self FK). Bosh sahifa `parent`siz kategoriyalarni bo'lim sarlavhasi, bolalarini kartochka qilib chiqaradi.
- **Telegram (3c):** `CustomerStore` `initData` va `requestContact` dan to'ldiriladi; `MainButton` checkout tugmasini aks ettiradi; `LocationManager` geolokatsiya o'rnini bosadi.

---

## 8. Texnologiyalar

Backend: Django 6, DRF, pytest. Frontend: Angular 21.2, Signals, Reactive Forms, SCSS, Vitest.
