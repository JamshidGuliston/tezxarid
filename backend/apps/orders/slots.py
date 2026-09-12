"""Delivery-slot availability: pure functions so they are easy to test with a fixed `now`."""
from datetime import datetime, timedelta
from django.conf import settings
from django.utils import timezone
from .models import DeliverySlot


def local_now():
    """Current aware datetime in the project time zone (patched in tests)."""
    return timezone.localtime()


def last_delivery_date(today):
    """Last date the checkout offers: today + DELIVERY_DAYS_AHEAD - 1 (inclusive)."""
    return today + timedelta(days=settings.DELIVERY_DAYS_AHEAD - 1)


def date_in_horizon(date, today):
    """Is `date` one of the days the checkout offers (today .. last_delivery_date)?"""
    return today <= date <= last_delivery_date(today)


def slot_is_open(slot, date, now):
    """Can an order for `slot` on `date` still be placed at `now`?

    Future dates are always open, past dates never; today is open only while
    `now + lead_minutes` is not past the slot start. `now` is normalized to the
    project time zone. Caller must separately verify the slot is active, belongs
    to the city, and that `date` is within DELIVERY_DAYS_AHEAD.
    """
    now = timezone.localtime(now)
    today = now.date()
    if date != today:
        return date > today
    start = datetime.combine(date, slot.start_time, tzinfo=now.tzinfo)
    return now + timedelta(minutes=slot.lead_minutes) <= start


def build_days(city, now=None):
    """Today plus the next DELIVERY_DAYS_AHEAD-1 days, each with the city's active slots:
    [{date: 'YYYY-MM-DD', slots: [{id, start, end, available}]}]."""
    now = timezone.localtime(now) if now is not None else local_now()
    today = now.date()
    slots = list(DeliverySlot.objects.filter(city=city, is_active=True)
                 .order_by('start_time', 'end_time'))
    days = []
    date = today
    last = last_delivery_date(today)
    while date <= last:
        days.append({
            'date': date.isoformat(),
            'slots': [{
                'id': s.id,
                'start': s.start_time.strftime('%H:%M'),
                'end': s.end_time.strftime('%H:%M'),
                'available': slot_is_open(s, date, now),
            } for s in slots],
        })
        date += timedelta(days=1)
    return days
