import os
import secrets

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from circuits.models import Circuit, CircuitTermination, CircuitType, Provider
from dcim.models import Cable, Device, DeviceRole, DeviceType, Interface, Manufacturer, Platform, PowerFeed, PowerOutlet, PowerPanel, PowerPort, Rack, Site
from ipam.models import IPAddress, Prefix, VLAN
from tenancy.models import ContactAssignment, Tenant
from users.models import ObjectPermission, Token
from vpn.models import Tunnel, TunnelTermination
from virtualization.models import Cluster, VirtualMachine, VMInterface
from extras.models import CustomField, CustomFieldChoiceSet, Dashboard

SITE_NAME = "Phoenix Lab"
DEVICE_NAME = "edge-phx-01"
USERNAME = "demo-mcp"
TOKEN_DESCRIPTION = "Enterprise MCP Kit disposable lab"
WRITER_USERNAME = "demo-mcp-writer"
WRITER_TOKEN_DESCRIPTION = "Enterprise MCP Kit bounded metadata writer"
PROVISIONER_USERNAME = "demo-mcp-provisioner"
PROVISIONER_TOKEN_DESCRIPTION = "Enterprise MCP Kit customer-site provisioner"

# The open portfolio tenant is an explicit intended-state reference. Runtime
# ownership and live telemetry remain outside NetBox; this seed only creates
# the tenant anchor and narrowly scoped provisioning permissions.
aiops_tenant, _ = Tenant.objects.update_or_create(
    slug="open-enterprise-aiops",
    defaults={"name": "Open Enterprise AIOps"},
)

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

# WireGuard is not a native NetBox tunnel encapsulation. Record only bounded,
# secret-free intended state on the virtual interface; runtime state belongs to
# WireGuard/telemetry and key material is always supplied out of band.
for field_name, label, field_type, description in [
    ("wireguard_peer_site", "WireGuard peer site", "text", "Sanitized intended remote site slug; not live peer state"),
    ("wireguard_peer_device", "WireGuard peer device", "text", "Sanitized intended remote device name"),
    ("wireguard_peer_interface", "WireGuard peer interface", "text", "Sanitized intended remote interface name"),
    ("wireguard_allowed_prefixes", "WireGuard allowed prefixes", "json", "Bounded intended routed prefixes"),
    ("wireguard_listen_port", "WireGuard listen port", "integer", "Intended UDP listen port"),
    ("wireguard_peer_public_key_fingerprint", "WireGuard peer public key fingerprint", "text", "Expected peer SHA-256 fingerprint only; never key material"),
]:
    field, _ = CustomField.objects.update_or_create(
        name=field_name,
        defaults={"label": label, "type": field_type, "description": description, "required": False, "weight": 120},
    )
    field.object_types.set([ContentType.objects.get_for_model(Interface)])

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
site_write_permission, _ = ObjectPermission.objects.update_or_create(
    name="Enterprise MCP Kit bounded site information write",
    defaults={"description": "View and change only the named sanitized showcase site", "enabled": True, "actions": ["view", "change"], "constraints": {"name": "Northstar Phoenix DC1"}},
)
site_write_permission.object_types.set([ContentType.objects.get_for_model(Site)])
site_write_permission.users.set([writer])

provisioner, _ = User.objects.get_or_create(username=PROVISIONER_USERNAME)
provisioner.is_active = True
provisioner.is_staff = False
provisioner.is_superuser = False
provisioner.email = "demo-mcp-provisioner@example.test"
provisioner.set_unusable_password()
provisioner.save()
provision_reference_permission, _ = ObjectPermission.objects.update_or_create(
    name="Enterprise MCP Kit provisioning reference discovery",
    defaults={"description": "View only reference records required by customer-site provisioning", "enabled": True, "actions": ["view"], "constraints": {}},
)
provision_reference_permission.object_types.set([
    ContentType.objects.get_for_model(Tenant), ContentType.objects.get_for_model(DeviceType),
    ContentType.objects.get_for_model(DeviceRole), ContentType.objects.get_for_model(Platform),
    ContentType.objects.get_for_model(Cluster), ContentType.objects.get_for_model(Provider), ContentType.objects.get_for_model(CircuitType),
])
provision_reference_permission.users.set([provisioner])
for model, constraints in [
    (Site, {"tenant__slug": "northstar-financial"}),
    (Rack, {"tenant__slug": "northstar-financial"}),
    (Device, {"tenant__slug": "northstar-financial"}),
    (Interface, {"device__tenant__slug": "northstar-financial"}),
    (IPAddress, {"tenant__slug": "northstar-financial"}),
    (VLAN, {"tenant__slug": "northstar-financial"}),
    (Prefix, {"tenant__slug": "northstar-financial"}),
    (VirtualMachine, {"tenant__slug": "northstar-financial"}),
    (VMInterface, {"virtual_machine__tenant__slug": "northstar-financial"}),
    (PowerPanel, {"site__tenant__slug": "northstar-financial"}),
    (PowerFeed, {"tenant__slug": "northstar-financial"}),
    (Cable, {"tenant__slug": "northstar-financial"}),
    (Circuit, {"tenant__slug": "northstar-financial"}),
    (Tunnel, {"tenant__slug": "northstar-financial"}),
]:
    model_name = model._meta.model_name
    record_permission, _ = ObjectPermission.objects.update_or_create(
        name=f"Enterprise MCP Kit Northstar provisioning {model_name}",
        defaults={"description": f"View, add, and delete Northstar {model_name} records admitted by the bounded adapter", "enabled": True, "actions": ["view", "add", "delete"], "constraints": constraints},
    )
    record_permission.object_types.set([ContentType.objects.get_for_model(model)])
    record_permission.users.set([provisioner])
ObjectPermission.objects.filter(name="Enterprise MCP Kit bounded customer-site provisioning").delete()

for model, constraints in [
    (Site, {"tenant__slug": "open-enterprise-aiops"}),
    (Rack, {"tenant__slug": "open-enterprise-aiops"}),
    (Device, {"tenant__slug": "open-enterprise-aiops"}),
    (Interface, {"device__tenant__slug": "open-enterprise-aiops"}),
    (IPAddress, {"tenant__slug": "open-enterprise-aiops"}),
    (VLAN, {"tenant__slug": "open-enterprise-aiops"}),
    (Prefix, {"tenant__slug": "open-enterprise-aiops"}),
    (VirtualMachine, {"tenant__slug": "open-enterprise-aiops"}),
    (VMInterface, {"virtual_machine__tenant__slug": "open-enterprise-aiops"}),
    (PowerPanel, {"site__tenant__slug": "open-enterprise-aiops"}),
    (PowerFeed, {"tenant__slug": "open-enterprise-aiops"}),
    (Cable, {"tenant__slug": "open-enterprise-aiops"}),
    (Circuit, {"tenant__slug": "open-enterprise-aiops"}),
    (Tunnel, {"tenant__slug": "open-enterprise-aiops"}),
]:
    model_name = model._meta.model_name
    record_permission, _ = ObjectPermission.objects.update_or_create(
        name=f"Enterprise MCP Kit AIOps provisioning {model_name}",
        defaults={"description": f"View, add, and delete open-enterprise-aiops {model_name} records admitted by the bounded adapter", "enabled": True, "actions": ["view", "add", "delete"], "constraints": constraints},
    )
    record_permission.object_types.set([ContentType.objects.get_for_model(model)])
    record_permission.users.set([provisioner])

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

Token.objects.filter(user=provisioner, description=PROVISIONER_TOKEN_DESCRIPTION).delete()
provisioner_plaintext = secrets.token_urlsafe(30)
provisioner_token = Token(user=provisioner, description=PROVISIONER_TOKEN_DESCRIPTION, version=2, token=provisioner_plaintext, write_enabled=True)
provisioner_token.save()

print(f"PHASE_B_TOKEN=nbt_{token.key}.{plaintext}")
print(f"PHASE_B_WRITE_TOKEN=nbt_{writer_token.key}.{writer_plaintext}")
print(f"PHASE_B_PROVISION_TOKEN=nbt_{provisioner_token.key}.{provisioner_plaintext}")
print(f"PHASE_B_DEVICE_ID={device.pk}")
