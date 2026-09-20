import pytest
from django.core.exceptions import ValidationError
from apps.common.validators import PHONE_VALIDATOR


@pytest.mark.parametrize('value', ['+998901234567', '998901234567', '123456789', '+' + '1' * 15])
def test_phone_validator_accepts(value):
    PHONE_VALIDATOR(value)


@pytest.mark.parametrize('value', ['12345678', '+' + '1' * 16, '+998 90 123 45 67', '90-123-45-67', '9989O1234567', ''])
def test_phone_validator_rejects(value):
    with pytest.raises(ValidationError):
        PHONE_VALIDATOR(value)
