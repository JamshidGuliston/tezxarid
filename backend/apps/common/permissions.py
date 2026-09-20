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
