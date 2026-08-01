import os
import secrets

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from circuits.models import Circuit, CircuitTermination
from dcim.models import Device, DeviceRole, DeviceType, Interface, Manufacturer, PowerFeed, PowerOutlet, PowerPort, Rack, Site
from tenancy.models import ContactAssignment
from users.models import ObjectPermission, Token
from vpn.models import Tunnel, TunnelTermination
from extras.models import CustomField, CustomFieldChoiceSet, Dashboard

SITE_NAME = "Phoenix Lab"
DEVICE_NAME = "edge-phx-01"
USERNAME = "demo-mcp"
TOKEN_DESCRIPTION = "Enterprise MCP Kit disposable lab"
WRITER_USERNAME = "demo-mcp-writer"
WRITER_TOKEN_DESCRIPTION = "Enterprise MCP Kit bounded metadata writer"

site, _ = Site.objects.update_or_create(
    slug="phoenix-lab",
    defaults={"name": SITE_NAME, "status": "active", "description": "Sanitized MCP demonstration site"},
)
manufacturer, _ = Manufacturer.objects.update_or_create(
    slug="example-networks",
    defaults={"name": "Example Networks"},
)
device_type, _ = DeviceType.objects.update_or_create(
    manufacturer=manufacturer,
    slug="edge-router-1000",
    defaults={"model": "Edge Router 1000", "u_height": 1},
)
role, _ = DeviceRole.objects.update_or_create(
    slug="edge-router",
    defaults={"name": "Edge Router", "color": "3f51b5", "vm_role": False},
)
device, _ = Device.objects.update_or_create(
    name=DEVICE_NAME,
    defaults={
        "site": site,
        "device_type": device_type,
        "role": role,
        "status": "active",
        "description": "Sanitized device used by the Enterprise MCP Kit demo",
    },
)

choice_set, _ = CustomFieldChoiceSet.objects.update_or_create(
    name="Reconciliation status",
    defaults={"extra_choices": [[value, value] for value in ["matched", "drifted", "missing-observation", "exception", "not-evaluated"]]},
)
reconciliation_field, _ = CustomField.objects.update_or_create(
    name="reconciliation_status",
    defaults={"label": "Reconciliation status", "type": "select", "choice_set": choice_set, "required": False, "weight": 110, "description": "Recorded comparison state; not live operational state"},
)
reconciliation_field.object_types.set([ContentType.objects.get_for_model(Device)])

User = get_user_model()
user, _ = User.objects.get_or_create(username=USERNAME)
user.is_active = True
user.is_staff = False
user.is_superuser = False
user.email = "demo-mcp@example.test"
user.set_unusable_password()
user.save()

# The lab is disposable: recreate only this dedicated demo user's dashboard so
# changes to DEFAULT_DASHBOARD are visible after reseeding. Never apply this
# pattern to real enterprise users without an explicit migration decision.
Dashboard.objects.filter(user=user).delete()
superuser_name = os.environ.get("SUPERUSER_NAME")
if superuser_name:
    Dashboard.objects.filter(user__username=superuser_name).delete()

permission = ObjectPermission.objects.filter(
    name__in=["Enterprise MCP Kit view devices", "Enterprise MCP Kit read context"]
).first() or ObjectPermission(name="Enterprise MCP Kit read context")
permission.name = "Enterprise MCP Kit read context"
permission.description = "Read-only access to the exact NetBox record types used by the disposable MCP lab"
permission.enabled = True
permission.actions = ["view"]
permission.constraints = {}
permission.full_clean()
permission.save()
permission.object_types.set([
    ContentType.objects.get_for_model(Device),
    ContentType.objects.get_for_model(Site),
    ContentType.objects.get_for_model(Rack),
    ContentType.objects.get_for_model(Circuit),
    ContentType.objects.get_for_model(CircuitTermination),
    ContentType.objects.get_for_model(ContactAssignment),
    ContentType.objects.get_for_model(Interface),
    ContentType.objects.get_for_model(PowerFeed),
    ContentType.objects.get_for_model(PowerOutlet),
    ContentType.objects.get_for_model(PowerPort),
    ContentType.objects.get_for_model(Tunnel),
    ContentType.objects.get_for_model(TunnelTermination),
])
permission.users.set([user])

writer, _ = User.objects.get_or_create(username=WRITER_USERNAME)
writer.is_active = True
writer.is_staff = False
writer.is_superuser = False
writer.email = "demo-mcp-writer@example.test"
writer.set_unusable_password()
writer.save()
write_permission, _ = ObjectPermission.objects.update_or_create(
    name="Enterprise MCP Kit bounded device metadata write",
    defaults={"description": "View and change only the named sanitized showcase device", "enabled": True, "actions": ["view", "change"], "constraints": {"name": "ns-phx-edge-01"}},
)
write_permission.object_types.set([ContentType.objects.get_for_model(Device)])
write_permission.users.set([writer])

Token.objects.filter(user=user, description=TOKEN_DESCRIPTION).delete()
plaintext = secrets.token_urlsafe(30)
token = Token(
    user=user,
    description=TOKEN_DESCRIPTION,
    version=2,
    token=plaintext,
    write_enabled=False,
)
token.save()

Token.objects.filter(user=writer, description=WRITER_TOKEN_DESCRIPTION).delete()
writer_plaintext = secrets.token_urlsafe(30)
writer_token = Token(user=writer, description=WRITER_TOKEN_DESCRIPTION, version=2, token=writer_plaintext, write_enabled=True)
writer_token.save()

print(f"PHASE_B_TOKEN=nbt_{token.key}.{plaintext}")
print(f"PHASE_B_WRITE_TOKEN=nbt_{writer_token.key}.{writer_plaintext}")
print(f"PHASE_B_DEVICE_ID={device.pk}")
