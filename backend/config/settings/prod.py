import os
from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa

if 'DJANGO_SECRET_KEY' not in os.environ:
    raise ImproperlyConfigured('DJANGO_SECRET_KEY environment variable must be set in production.')
SECRET_KEY = os.environ['DJANGO_SECRET_KEY']

DEBUG = False
ALLOWED_HOSTS = os.environ.get('DJANGO_ALLOWED_HOSTS', 'tezxarid.uz').split(',')
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('DB_NAME', 'tezxarid'),
        'USER': os.environ.get('DB_USER', 'tezxarid'),
        'PASSWORD': os.environ.get('DB_PASSWORD', ''),
        'HOST': os.environ.get('DB_HOST', 'db'),
        'PORT': os.environ.get('DB_PORT', '5432'),
    }
}
