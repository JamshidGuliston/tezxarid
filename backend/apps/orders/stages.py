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
