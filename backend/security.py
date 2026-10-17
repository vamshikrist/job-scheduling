"""XSUAA JWT validation for Flask routes."""
import os
from functools import wraps

from flask import abort, g, request
from sap.xssec import create_security_context

from config import get_xsuaa_credentials, running_on_cf


def _auth_disabled():
    # Only honoured off Cloud Foundry, so it can never switch auth off in production
    return not running_on_cf() and os.environ.get("LOCAL_DEV_NO_AUTH") == "1"


def require_scope(local_scope):
    """Require a valid XSUAA token carrying $XSAPPNAME.<local_scope>."""

    def decorator(view):
        @wraps(view)
        def wrapper(*args, **kwargs):
            if _auth_disabled():
                return view(*args, **kwargs)

            auth_header = request.headers.get("Authorization", "")
            if not auth_header.startswith("Bearer "):
                abort(401, description="Missing bearer token")

            uaa = get_xsuaa_credentials()
            if not uaa:
                abort(500, description="XSUAA service is not bound")

            try:
                ctx = create_security_context(auth_header[len("Bearer "):], uaa)
            except Exception:
                abort(401, description="Invalid token")

            if not ctx.check_local_scope(local_scope):
                abort(403, description=f"Missing scope '{local_scope}'")

            g.security_context = ctx
            return view(*args, **kwargs)

        return wrapper

    return decorator
