import os
from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa


def _env_bool(name, default):
    return os.environ.get(name, '1' if default else '0').strip().lower() in ('1', 'true', 'yes', 'on')


def _env_list(name, default=''):
    return [v.strip() for v in os.environ.get(name, default).split(',') if v.strip()]


if 'DJANGO_SECRET_KEY' not in os.environ:
    raise ImproperlyConfigured('DJANGO_SECRET_KEY environment variable must be set in production.')
SECRET_KEY = os.environ['DJANGO_SECRET_KEY']

if 'TELEGRAM_BOT_TOKEN' not in os.environ:
    raise ImproperlyConfigured('TELEGRAM_BOT_TOKEN environment variable must be set in production.')
TELEGRAM_BOT_TOKEN = os.environ['TELEGRAM_BOT_TOKEN']

DEBUG = False
ALLOWED_HOSTS = _env_list('DJANGO_ALLOWED_HOSTS', 'tezxarid.uz,www.tezxarid.uz')
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('DB_NAME', 'tezxarid'),
        'USER': os.environ.get('DB_USER', 'tezxarid'),
        'PASSWORD': os.environ.get('DB_PASSWORD', ''),
        'HOST': os.environ.get('DB_HOST', 'db'),
        'PORT': os.environ.get('DB_PORT', '5432'),
        'CONN_MAX_AGE': 60,
    }
}

# Files: nginx serves STATIC_ROOT at /static/ and MEDIA_ROOT at /media/ (see docs/deploy.md).
STATIC_ROOT = os.environ.get('DJANGO_STATIC_ROOT', str(BASE_DIR / 'staticfiles'))
MEDIA_ROOT = os.environ.get('DJANGO_MEDIA_ROOT', str(BASE_DIR / 'media'))

# Browser origins allowed to call the API. Empty when the SPA is served from the same domain.
CORS_ALLOWED_ORIGINS = _env_list('DJANGO_CORS_ALLOWED_ORIGINS')
CSRF_TRUSTED_ORIGINS = _env_list(
    'DJANGO_CSRF_TRUSTED_ORIGINS',
    ','.join(f'https://{h}' for h in ALLOWED_HOSTS if not h.startswith('.') and h != '*'))

# HTTPS: the app runs behind a TLS-terminating proxy (nginx) that forwards X-Forwarded-Proto.
# Set DJANGO_SECURE_SSL_REDIRECT=0 only for a plain-HTTP trial deployment.
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_SSL_REDIRECT = _env_bool('DJANGO_SECURE_SSL_REDIRECT', True)
SESSION_COOKIE_SECURE = SECURE_SSL_REDIRECT
CSRF_COOKIE_SECURE = SECURE_SSL_REDIRECT
SECURE_HSTS_SECONDS = int(os.environ.get('DJANGO_SECURE_HSTS_SECONDS', '31536000')) if SECURE_SSL_REDIRECT else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = SECURE_SSL_REDIRECT
SECURE_CONTENT_TYPE_NOSNIFF = True
