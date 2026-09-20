from django.core.validators import RegexValidator

# Digits with an optional leading +, 9–15 long (the frontend normalises to +998XXXXXXXXX).
PHONE_VALIDATOR = RegexValidator(r'^\+?\d{9,15}$', 'Enter a valid phone number.')
