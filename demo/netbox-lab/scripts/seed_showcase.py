from django.contrib.contenttypes.models import ContentType
from circuits.models import Circuit, CircuitTermination, CircuitType, Provider
from dcim.models import (
    Cable,
    Device,
    DeviceRole,
    DeviceType,
    Interface,
    Location,
    Manufacturer,
    Platform,
    PowerFeed,
    PowerPanel,
    PowerPort,
    PowerOutlet,
    Rack,
    Region,
    Site,
)
from extras.models import CustomField, CustomFieldChoiceSet
from ipam.models import IPAddress, Prefix, Service, VLAN, VRF
from tenancy.models import Contact, ContactAssignment, ContactGroup, ContactRole, Tenant, TenantGroup
from virtualization.models import Cluster, ClusterType, VirtualMachine, VMInterface
from vpn.models import Tunnel, TunnelGroup, TunnelTermination


def save(model, lookup, defaults):
    obj = model.objects.filter(**lookup).first() or model(**lookup)
    for key, value in defaults.items():
        setattr(obj, key, value)
    obj.full_clean()
    obj.save()
    return obj


def cable(label, a, b, tenant, cable_type):
    existing = Cable.objects.filter(label=label).first()
    if existing:
        return existing
    item = Cable(
        a_terminations=[a],
        b_terminations=[b],
        label=label,
        tenant=tenant,
        type=cable_type,
        status="connected",
    )
    item.full_clean()
    item.save()
    return item


def interface(device, name, address=None, vrf=None, description=""):
    item = save(
        Interface,
        {"device": device, "name": name},
        {"type": "1000base-t", "enabled": True, "vrf": vrf, "description": description},
    )
    if address:
        ip = save(
            IPAddress,
            {"address": address, "vrf": vrf},
            {
                "status": "active",
                "tenant": device.tenant,
                "description": f"Primary management address for {device.name}",
                "assigned_object_type": ContentType.objects.get_for_model(Interface),
                "assigned_object_id": item.pk,
            },
        )
        device.primary_ip4 = ip
        device.save()
    return item


def device(name, tenant, site, rack, position, device_type, role, description):
    return save(
        Device,
        {"name": name},
        {
            "tenant": tenant,
            "site": site,
            "location": rack.location if rack else None,
            "rack": rack,
            "position": position,
            "face": "front" if rack and position else "",
            "device_type": device_type,
            "role": role,
            "status": "active",
            "description": description,
        },
    )


enterprise_group = save(
    TenantGroup,
    {"slug": "showcase-organizations"},
    {"name": "Showcase Organizations", "description": "Sanitized enterprise demonstration tenants"},
)
northstar = save(Tenant, {"slug": "northstar-financial"}, {"name": "Northstar Financial", "group": enterprise_group, "description": "Hybrid financial services enterprise"})
summit = save(Tenant, {"slug": "summit-digital"}, {"name": "Summit Digital", "group": enterprise_group, "description": "Cloud and platform engineering organization"})
atlas = save(Tenant, {"slug": "atlas-managed-services"}, {"name": "Atlas Managed Services", "group": enterprise_group, "description": "Multi-tenant managed infrastructure provider"})

contacts = save(ContactGroup, {"slug": "showcase-operations"}, {"name": "Showcase Operations", "description": "Sanitized operational contacts"})
operations = save(ContactRole, {"slug": "operations"}, {"name": "Operations", "description": "Primary operations contact"})
emergency = save(ContactRole, {"slug": "emergency"}, {"name": "Emergency", "description": "Escalation contact"})
contacts_by_slug = {}
for slug, name, title in [
    ("northstar-noc", "Northstar NOC", "Network Operations"),
    ("summit-platform", "Summit Platform Team", "Platform Operations"),
    ("atlas-service-desk", "Atlas Service Desk", "Managed Services Operations"),
]:
    contact = save(Contact, {"name": name}, {"title": title, "email": f"{slug}@example.test", "description": "Sanitized demonstration contact"})
    contact.groups.set([contacts])
    contacts_by_slug[slug] = contact

us = save(Region, {"slug": "united-states"}, {"name": "United States", "description": "Showcase geography"})
west = save(Region, {"slug": "us-west"}, {"name": "US West", "parent": us, "description": "Western showcase region"})
cloud = save(Region, {"slug": "cloud-regions"}, {"name": "Cloud Regions", "parent": us, "description": "Network-relevant cloud edge locations"})

phx = save(Site, {"slug": "northstar-phx-dc1"}, {"name": "Northstar Phoenix DC1", "tenant": northstar, "region": west, "status": "active", "facility": "PHX-DC1", "physical_address": "100 Example Way, Phoenix, AZ", "description": "Primary production data center"})
reno = save(Site, {"slug": "northstar-reno-dr"}, {"name": "Northstar Reno DR", "tenant": northstar, "region": west, "status": "active", "facility": "RNO-DR1", "description": "Disaster recovery data center"})
hq = save(Site, {"slug": "northstar-hq"}, {"name": "Northstar Headquarters", "tenant": northstar, "region": west, "status": "active", "facility": "NS-HQ", "description": "Corporate headquarters and campus edge"})
summit_edge = save(Site, {"slug": "summit-cloud-edge"}, {"name": "Summit Cloud Edge", "tenant": summit, "region": cloud, "status": "active", "facility": "CLOUD-WEST", "description": "Hybrid cloud transit and platform edge"})
atlas_colo = save(Site, {"slug": "atlas-colo-west"}, {"name": "Atlas Colo West", "tenant": atlas, "region": west, "status": "active", "facility": "ATLAS-COLO1", "description": "Shared managed-services colocation"})

for site, contact in [
    (phx, contacts_by_slug["northstar-noc"]),
    (reno, contacts_by_slug["northstar-noc"]),
    (hq, contacts_by_slug["northstar-noc"]),
    (summit_edge, contacts_by_slug["summit-platform"]),
    (atlas_colo, contacts_by_slug["atlas-service-desk"]),
]:
    save(ContactAssignment, {"object_type": ContentType.objects.get_for_model(Site), "object_id": site.pk, "contact": contact, "role": operations}, {"priority": "primary"})

def room(site, slug, name):
    return save(Location, {"site": site, "slug": slug}, {"name": name, "status": "active", "tenant": site.tenant, "description": "Showcase equipment room"})


phx_room = room(phx, "phx-data-hall-a", "Data Hall A")
reno_room = room(reno, "reno-data-hall-a", "DR Data Hall")
summit_room = room(summit_edge, "summit-edge-room", "Cloud Edge Room")
atlas_room = room(atlas_colo, "atlas-shared-suite", "Shared Customer Suite")

def rack(site, location, name, tenant, description):
    return save(
        Rack,
        {"site": site, "name": name},
        {
            "location": location,
            "tenant": tenant,
            "status": "active",
            "u_height": 42,
            "width": 19,
            "description": description,
        },
    )


phx_a01 = rack(phx, phx_room, "PHX-A01", northstar, "Production network and security")
phx_a02 = rack(phx, phx_room, "PHX-A02", northstar, "Production compute")
reno_b01 = rack(reno, reno_room, "RNO-B01", northstar, "Disaster recovery infrastructure")
summit_c01 = rack(summit_edge, summit_room, "SUM-C01", summit, "Hybrid cloud edge")
atlas_m01 = rack(atlas_colo, atlas_room, "ATL-M01", atlas, "Shared managed-services core")

example = save(Manufacturer, {"slug": "example-networks"}, {"name": "Example Networks", "description": "Sanitized demonstration manufacturer"})
compute = save(Manufacturer, {"slug": "example-compute"}, {"name": "Example Compute", "description": "Sanitized demonstration manufacturer"})

router_type = save(DeviceType, {"manufacturer": example, "slug": "edge-router-1000"}, {"model": "Edge Router 1000", "u_height": 1})
switch_type = save(DeviceType, {"manufacturer": example, "slug": "fabric-switch-48"}, {"model": "Fabric Switch 48", "u_height": 1})
firewall_type = save(DeviceType, {"manufacturer": example, "slug": "secure-gateway-500"}, {"model": "Secure Gateway 500", "u_height": 1})
server_type = save(DeviceType, {"manufacturer": compute, "slug": "compute-node-2u"}, {"model": "Compute Node 2U", "u_height": 2})
pdu_type = save(DeviceType, {"manufacturer": compute, "slug": "rack-pdu-0u"}, {"model": "Rack PDU 0U", "u_height": 0})

router_role = save(DeviceRole, {"slug": "edge-router"}, {"name": "Edge Router", "color": "3f51b5", "vm_role": False})
switch_role = save(DeviceRole, {"slug": "core-switch"}, {"name": "Core Switch", "color": "009688", "vm_role": False})
firewall_role = save(DeviceRole, {"slug": "firewall"}, {"name": "Firewall", "color": "f44336", "vm_role": False})
server_role = save(DeviceRole, {"slug": "application-server"}, {"name": "Application Server", "color": "607d8b", "vm_role": True})
pdu_role = save(DeviceRole, {"slug": "power-distribution"}, {"name": "Power Distribution", "color": "ff9800", "vm_role": False})

inventory = [
    ("ns-phx-edge-01", northstar, phx, phx_a01, 42, router_type, router_role, "Primary Phoenix WAN edge"),
    ("ns-phx-fw-01", northstar, phx, phx_a01, 40, firewall_type, firewall_role, "Primary Phoenix security gateway"),
    ("ns-phx-core-01", northstar, phx, phx_a01, 38, switch_type, switch_role, "Phoenix production core"),
    ("ns-phx-app-01", northstar, phx, phx_a02, 38, server_type, server_role, "Primary customer application node"),
    ("ns-phx-app-02", northstar, phx, phx_a02, 36, server_type, server_role, "Secondary customer application node"),
    ("ns-reno-edge-01", northstar, reno, reno_b01, 42, router_type, router_role, "Disaster recovery WAN edge"),
    ("ns-reno-app-01", northstar, reno, reno_b01, 38, server_type, server_role, "Disaster recovery application node"),
    ("sum-cloud-edge-01", summit, summit_edge, summit_c01, 42, router_type, router_role, "Cloud transit edge"),
    ("sum-platform-01", summit, summit_edge, summit_c01, 38, server_type, server_role, "Platform management node"),
    ("atlas-core-01", atlas, atlas_colo, atlas_m01, 42, switch_type, switch_role, "Shared managed-services core"),
    ("atlas-fw-01", atlas, atlas_colo, atlas_m01, 40, firewall_type, firewall_role, "Shared customer firewall"),
]
devices = {}
for values in inventory:
    item = device(*values)
    devices[item.name] = item

for name, tenant, site, rack_obj in [
    ("ns-phx-pdu-a", northstar, phx, phx_a01),
    ("ns-phx-compute-pdu-a", northstar, phx, phx_a02),
    ("ns-phx-compute-pdu-b", northstar, phx, phx_a02),
    ("ns-phx-pdu-b", northstar, phx, phx_a01),
    ("ns-reno-pdu-a", northstar, reno, reno_b01),
    ("ns-reno-pdu-b", northstar, reno, reno_b01),
    ("sum-edge-pdu-a", summit, summit_edge, summit_c01),
    ("sum-edge-pdu-b", summit, summit_edge, summit_c01),
    ("atlas-pdu-a", atlas, atlas_colo, atlas_m01),
    ("atlas-pdu-b", atlas, atlas_colo, atlas_m01),
]:
    devices[name] = device(name, tenant, site, rack_obj, None, pdu_type, pdu_role, "Rack power distribution")

vrfs = {
    "northstar": save(VRF, {"rd": "65001:100"}, {"name": "Northstar Production", "tenant": northstar, "enforce_unique": True}),
    "summit": save(VRF, {"rd": "65002:100"}, {"name": "Summit Platform", "tenant": summit, "enforce_unique": True}),
    "atlas": save(VRF, {"rd": "65003:100"}, {"name": "Atlas Customers", "tenant": atlas, "enforce_unique": True}),
}
vlans = {
    "northstar": save(VLAN, {"site": phx, "vid": 110}, {"name": "Production Applications", "tenant": northstar, "status": "active"}),
    "summit": save(VLAN, {"site": summit_edge, "vid": 210}, {"name": "Platform Management", "tenant": summit, "status": "active"}),
    "atlas": save(VLAN, {"site": atlas_colo, "vid": 310}, {"name": "Managed Customer Transit", "tenant": atlas, "status": "active"}),
}
for prefix, vrf, tenant, vlan, description in [
    ("10.10.10.0/24", vrfs["northstar"], northstar, vlans["northstar"], "Northstar production applications"),
    ("10.20.10.0/24", vrfs["summit"], summit, vlans["summit"], "Summit platform management"),
    ("10.30.10.0/24", vrfs["atlas"], atlas, vlans["atlas"], "Atlas managed customer transit"),
]:
    save(Prefix, {"prefix": prefix, "vrf": vrf}, {"tenant": tenant, "vlan": vlan, "status": "active", "description": description})

interface(devices["ns-phx-edge-01"], "mgmt0", "10.10.10.11/24", vrfs["northstar"], "Management")
interface(devices["ns-phx-fw-01"], "mgmt0", "10.10.10.12/24", vrfs["northstar"], "Management")
interface(devices["ns-phx-core-01"], "mgmt0", "10.10.10.13/24", vrfs["northstar"], "Management")
interface(devices["ns-phx-app-01"], "mgmt0", "10.10.10.21/24", vrfs["northstar"], "Management")
interface(devices["ns-phx-app-02"], "mgmt0", "10.10.10.22/24", vrfs["northstar"], "Management")
interface(devices["ns-reno-edge-01"], "mgmt0", "10.10.10.31/24", vrfs["northstar"], "DR management")
interface(devices["sum-cloud-edge-01"], "mgmt0", "10.20.10.11/24", vrfs["summit"], "Cloud edge management")
interface(devices["sum-platform-01"], "mgmt0", "10.20.10.21/24", vrfs["summit"], "Platform management")
interface(devices["atlas-core-01"], "mgmt0", "10.30.10.11/24", vrfs["atlas"], "Managed core management")
interface(devices["atlas-fw-01"], "mgmt0", "10.30.10.12/24", vrfs["atlas"], "Firewall management")

edge_wan = interface(devices["ns-phx-edge-01"], "ge-0/0/0", description="Carrier handoff")
fw_wan = interface(devices["ns-phx-fw-01"], "wan0", description="Outside")
fw_lan = interface(devices["ns-phx-fw-01"], "lan0", description="Inside")
core_uplink = interface(devices["ns-phx-core-01"], "et-0/0/1", description="Firewall uplink")
core_app1 = interface(devices["ns-phx-core-01"], "et-0/0/2", description="Application node 1")
core_app2 = interface(devices["ns-phx-core-01"], "et-0/0/3", description="Application node 2")
app1_data = interface(devices["ns-phx-app-01"], "eth1", description="Production data")
app2_data = interface(devices["ns-phx-app-02"], "eth1", description="Production data")
cable("PHX-NET-EDGE-FW", edge_wan, fw_wan, northstar, "smf")
cable("PHX-NET-FW-CORE", fw_lan, core_uplink, northstar, "smf")
cable("PHX-NET-CORE-APP1", core_app1, app1_data, northstar, "smf")
cable("PHX-NET-CORE-APP2", core_app2, app2_data, northstar, "smf")

for dev in devices.values():
    if dev.role != pdu_role:
        save(PowerPort, {"device": dev, "name": "PSU-A"}, {"type": "iec-60320-c14", "maximum_draw": 600, "allocated_draw": 300})
        save(PowerPort, {"device": dev, "name": "PSU-B"}, {"type": "iec-60320-c14", "maximum_draw": 600, "allocated_draw": 300})

power_sets = [
    (phx, phx_room, phx_a01, "PHX-A01", devices["ns-phx-pdu-a"], devices["ns-phx-pdu-b"]),
    (phx, phx_room, phx_a02, "PHX-A02", devices["ns-phx-compute-pdu-a"], devices["ns-phx-compute-pdu-b"]),
    (reno, reno_room, reno_b01, "RNO", devices["ns-reno-pdu-a"], devices["ns-reno-pdu-b"]),
    (summit_edge, summit_room, summit_c01, "SUM", devices["sum-edge-pdu-a"], devices["sum-edge-pdu-b"]),
    (atlas_colo, atlas_room, atlas_m01, "ATL", devices["atlas-pdu-a"], devices["atlas-pdu-b"]),
]
for site, location, rack_obj, prefix, pdu_a, pdu_b in power_sets:
    panel = save(PowerPanel, {"site": site, "name": f"{prefix}-PANEL-1"}, {"location": location, "description": "Redundant showcase power panel"})
    feed_a = save(PowerFeed, {"power_panel": panel, "name": f"{prefix}-FEED-A"}, {"rack": rack_obj, "status": "active", "type": "primary", "supply": "ac", "phase": "single-phase", "voltage": 208, "amperage": 30, "max_utilization": 80, "tenant": site.tenant})
    feed_b = save(PowerFeed, {"power_panel": panel, "name": f"{prefix}-FEED-B"}, {"rack": rack_obj, "status": "active", "type": "redundant", "supply": "ac", "phase": "single-phase", "voltage": 208, "amperage": 30, "max_utilization": 80, "tenant": site.tenant})
    PowerFeed.objects.filter(rack=rack_obj, name=feed_a.name).exclude(pk=feed_a.pk).delete()
    PowerFeed.objects.filter(rack=rack_obj, name=feed_b.name).exclude(pk=feed_b.pk).delete()
    pdu_a_input = save(PowerPort, {"device": pdu_a, "name": "INPUT-A"}, {"type": "iec-60309-p-n-e-6h", "maximum_draw": 6240, "allocated_draw": 4000})
    pdu_b_input = save(PowerPort, {"device": pdu_b, "name": "INPUT-B"}, {"type": "iec-60309-p-n-e-6h", "maximum_draw": 6240, "allocated_draw": 4000})
    cable(f"{prefix}-POWER-FEED-A", feed_a, pdu_a_input, site.tenant, "power")
    cable(f"{prefix}-POWER-FEED-B", feed_b, pdu_b_input, site.tenant, "power")
    for number in range(1, 9):
        save(PowerOutlet, {"device": pdu_a, "name": f"A-{number:02d}"}, {"type": "iec-60320-c13", "power_port": pdu_a_input, "feed_leg": "A"})
        save(PowerOutlet, {"device": pdu_b, "name": f"B-{number:02d}"}, {"type": "iec-60320-c13", "power_port": pdu_b_input, "feed_leg": "B"})

for rack_obj, pdu_a, pdu_b in [(item[2], item[4], item[5]) for item in power_sets]:
    powered = list(Device.objects.filter(rack=rack_obj).exclude(role=pdu_role).order_by("name"))
    for index, dev in enumerate(powered, start=1):
        outlet_a = PowerOutlet.objects.get(device=pdu_a, name=f"A-{index:02d}")
        outlet_b = PowerOutlet.objects.get(device=pdu_b, name=f"B-{index:02d}")
        cable(f"{dev.name}-POWER-A", outlet_a, dev.powerports.get(name="PSU-A"), dev.tenant, "power")
        cable(f"{dev.name}-POWER-B", outlet_b, dev.powerports.get(name="PSU-B"), dev.tenant, "power")

provider = save(Provider, {"slug": "example-carrier"}, {"name": "Example Carrier", "description": "Sanitized WAN provider"})
internet = save(CircuitType, {"slug": "internet-transit"}, {"name": "Internet Transit", "color": "2196f3"})
private = save(CircuitType, {"slug": "private-wan"}, {"name": "Private WAN", "color": "673ab7"})
for cid, circuit_type, tenant, a, z, description in [
    ("EX-NS-INET-001", internet, northstar, phx, hq, "Northstar primary Internet path"),
    ("EX-NS-DR-001", private, northstar, phx, reno, "Northstar primary-to-DR private WAN"),
    ("EX-SUM-CLOUD-001", private, summit, summit_edge, phx, "Summit hybrid cloud interconnect"),
    ("EX-ATL-MSP-001", internet, atlas, atlas_colo, hq, "Atlas managed-services upstream"),
]:
    circuit = save(Circuit, {"provider": provider, "cid": cid}, {"type": circuit_type, "tenant": tenant, "status": "active", "description": description, "commit_rate": 1000000})
    for side, endpoint in [("A", a), ("Z", z)]:
        save(CircuitTermination, {"circuit": circuit, "term_side": side}, {"termination_type": ContentType.objects.get_for_model(Site), "termination_id": endpoint.pk, "port_speed": 1000000, "description": f"{endpoint.name} handoff"})

cluster_type = save(ClusterType, {"slug": "kubernetes-platform"}, {"name": "Kubernetes Platform", "description": "Sanitized platform cluster"})
summit_cluster = save(Cluster, {"name": "summit-prod-west"}, {"type": cluster_type, "tenant": summit, "status": "active", "scope_type": ContentType.objects.get_for_model(Site), "scope_id": summit_edge.pk, "description": "Summit production platform"})
northstar_cluster = save(Cluster, {"name": "northstar-governance-lab"}, {"type": cluster_type, "tenant": northstar, "status": "active", "scope_type": ContentType.objects.get_for_model(Site), "scope_id": phx.pk, "description": "Sanitized Northstar governance verification cluster"})
for name, address, description in [
    ("summit-control-01", "10.20.10.31/24", "Platform control plane"),
    ("summit-worker-01", "10.20.10.41/24", "Platform worker"),
    ("summit-worker-02", "10.20.10.42/24", "Platform worker"),
]:
    vm = save(VirtualMachine, {"name": name}, {"cluster": summit_cluster, "tenant": summit, "status": "active", "role": server_role, "vcpus": 4, "memory": 8192, "disk": 80, "description": description})
    vmi = save(VMInterface, {"virtual_machine": vm, "name": "eth0"}, {"enabled": True, "vrf": vrfs["summit"], "description": "Platform management"})
    ip = save(IPAddress, {"address": address, "vrf": vrfs["summit"]}, {"tenant": summit, "status": "active", "assigned_object_type": ContentType.objects.get_for_model(VMInterface), "assigned_object_id": vmi.pk, "description": f"Primary address for {name}"})
    vm.primary_ip4 = ip
    vm.save()

# Keep intended and observed software state distinct. The fixed timestamp makes
# repeated seeds deterministic and the source field makes provenance explicit.
device_content_type = ContentType.objects.get_for_model(Device)
virtual_machine_content_type = ContentType.objects.get_for_model(VirtualMachine)
cluster_content_type = ContentType.objects.get_for_model(Cluster)
version_fields = [
    ("observed_software_version", "Observed software version", "Version recorded by the sanitized lab seed"),
    ("minimum_approved_version", "Minimum approved version", "Example enterprise version floor"),
    ("version_compliance", "Version compliance", "Example comparison of observed and approved state"),
    ("version_evidence_source", "Version evidence source", "Where the version observation came from"),
    ("version_observed_at", "Version observed at", "Timestamp associated with the example observation"),
    ("workload_software_versions", "Workload software versions", "Sanitized application and platform component versions"),
    ("redundancy_group", "Redundancy group", "Logical service redundancy membership"),
    ("failure_domain", "Failure domain", "Independent infrastructure failure boundary"),
]
for field_name, label, description in version_fields:
    field = save(
        CustomField,
        {"name": field_name},
        {
            "label": label,
            "type": "text",
            "description": description,
            "required": False,
            "weight": 100,
        },
    )
    field.object_types.set([device_content_type, virtual_machine_content_type, cluster_content_type])

reconciliation_choices = save(CustomFieldChoiceSet, {"name": "Reconciliation status"}, {"extra_choices": [[value, value] for value in ["matched", "drifted", "missing-observation", "exception", "not-evaluated"]]})
reconciliation_field = save(CustomField, {"name": "reconciliation_status"}, {"label": "Reconciliation status", "type": "select", "choice_set": reconciliation_choices, "description": "Recorded comparison state; not live operational state", "required": False, "weight": 110})
reconciliation_field.object_types.set([device_content_type])

network_platform = save(
    Platform,
    {"slug": "example-network-os"},
    {"name": "Example Network OS", "manufacturer": example, "description": "Sanitized network operating system"},
)
security_platform = save(
    Platform,
    {"slug": "example-secure-os"},
    {"name": "Example Secure OS", "manufacturer": example, "description": "Sanitized security appliance operating system"},
)
linux_platform = save(
    Platform,
    {"slug": "enterprise-linux"},
    {"name": "Enterprise Linux", "manufacturer": compute, "description": "Sanitized server operating system"},
)
facility_platform = save(
    Platform,
    {"slug": "example-facility-firmware"},
    {"name": "Example Facility Firmware", "manufacturer": compute, "description": "Sanitized facility device firmware"},
)

version_profiles = {
    router_role.pk: (network_platform, "12.4.3", "12.4.0"),
    switch_role.pk: (network_platform, "12.4.3", "12.4.0"),
    firewall_role.pk: (security_platform, "8.2.1", "8.2.0"),
    server_role.pk: (linux_platform, "9.6", "9.5"),
    pdu_role.pk: (facility_platform, "3.7.2", "3.7.0"),
}
redundancy = {
    "ns-phx-app-01": ("northstar-production-app", "phoenix-compute-a"),
    "ns-phx-app-02": ("northstar-production-app", "phoenix-compute-b"),
    "ns-phx-edge-01": ("northstar-wan-edge", "phoenix-edge"),
    "ns-reno-edge-01": ("northstar-wan-edge", "reno-edge"),
    "sum-cloud-edge-01": ("summit-hybrid-edge", "cloud-west-edge"),
    "atlas-core-01": ("atlas-managed-core", "atlas-colo-west"),
}
for dev in devices.values():
    platform, observed, minimum = version_profiles[dev.role_id]
    group, domain = redundancy.get(dev.name, (f"{dev.tenant.slug}-standalone", f"{dev.site.slug}-{dev.rack.name.lower()}"))
    dev.platform = platform
    dev.custom_field_data.update(
        {
            "observed_software_version": observed,
            "minimum_approved_version": minimum,
            "version_compliance": "meets-example-policy",
            "version_evidence_source": "sanitized-lab-seed",
            "version_observed_at": "2026-07-28T12:00:00Z",
            "redundancy_group": group,
            "failure_domain": domain,
            "reconciliation_status": "matched",
        }
    )
    dev.full_clean()
    dev.save()

# Virtual infrastructure uses the same evidence vocabulary as physical devices.
# The platform version and workload versions remain separate so a VM operating
# system is not confused with the Kubernetes software running on it.
virtual_machine_profiles = {
    "summit-control-01": "Kubernetes control plane 1.34.1; etcd 3.6.4; containerd 2.1.4",
    "summit-worker-01": "Kubernetes worker 1.34.1; containerd 2.1.4; CNI 1.7.1",
    "summit-worker-02": "Kubernetes worker 1.34.1; containerd 2.1.4; CNI 1.7.1",
}
for vm_name, workload_versions in virtual_machine_profiles.items():
    vm = VirtualMachine.objects.get(name=vm_name)
    vm.platform = linux_platform
    vm.custom_field_data.update(
        {
            "observed_software_version": "9.6",
            "minimum_approved_version": "9.5",
            "version_compliance": "meets-example-policy",
            "version_evidence_source": "sanitized-lab-seed",
            "version_observed_at": "2026-07-28T12:00:00Z",
            "workload_software_versions": workload_versions,
            "redundancy_group": "summit-production-platform",
            "failure_domain": f"summit-cloud-{vm_name.rsplit('-', 1)[-1]}",
        }
    )
    vm.full_clean()
    vm.save()

summit_cluster.custom_field_data.update(
    {
        "observed_software_version": "1.34.1",
        "minimum_approved_version": "1.33.0",
        "version_compliance": "meets-example-policy",
        "version_evidence_source": "sanitized-lab-seed",
        "version_observed_at": "2026-07-28T12:00:00Z",
        "workload_software_versions": "Kubernetes 1.34.1; etcd 3.6.4; CNI 1.7.1; containerd 2.1.4",
        "redundancy_group": "summit-production-platform",
        "failure_domain": "cloud-west-multi-node",
    }
)
summit_cluster.full_clean()
summit_cluster.save()

# Attach network services to concrete devices for future bounded lookups.
for parent, name, protocol, ports, description in [
    (devices["ns-phx-app-01"], "Customer API", "tcp", [443], "Primary HTTPS application endpoint"),
    (devices["ns-phx-app-02"], "Customer API", "tcp", [443], "Secondary HTTPS application endpoint"),
    (devices["ns-reno-app-01"], "Customer API DR", "tcp", [443], "Disaster recovery HTTPS endpoint"),
    (devices["sum-platform-01"], "Platform API", "tcp", [6443], "Kubernetes-style control endpoint"),
    (devices["atlas-core-01"], "BGP", "tcp", [179], "Managed routing control plane"),
]:
    save(
        Service,
        {
            "parent_object_type": device_content_type,
            "parent_object_id": parent.pk,
            "name": name,
        },
        {"protocol": protocol, "ports": ports, "description": description},
    )

# Terminate every circuit on a concrete customer-side interface. The remote end
# remains a sanitized site because provider equipment is outside the inventory.
handoffs = {
    "EX-NS-INET-001": (devices["ns-phx-edge-01"], "ge-0/0/1", "192.0.2.1/30"),
    "EX-NS-DR-001": (devices["ns-phx-edge-01"], "ge-0/0/2", "192.0.2.5/30"),
    "EX-SUM-CLOUD-001": (devices["sum-cloud-edge-01"], "ge-0/0/1", "198.51.100.1/30"),
    "EX-ATL-MSP-001": (devices["atlas-core-01"], "et-0/0/48", "203.0.113.1/30"),
}
handoff_interfaces = {}
for cid, (dev, name, address) in handoffs.items():
    handoff = interface(dev, name, address, description=f"Carrier handoff for {cid}")
    handoff_interfaces[cid] = handoff
    circuit = Circuit.objects.get(provider=provider, cid=cid)
    save(
        CircuitTermination,
        {"circuit": circuit, "term_side": "A"},
        {
            "termination_type": ContentType.objects.get_for_model(Interface),
            "termination_id": handoff.pk,
            "port_speed": 1000000,
            "description": f"Customer handoff on {dev.name} {name}",
        },
    )

# Use documentation-only address ranges for native site-to-site VPN objects.
reno_tunnel_outside = interface(devices["ns-reno-edge-01"], "ge-0/0/1", "192.0.2.6/30", description="DR private WAN")
summit_cloud_outside = interface(devices["sum-cloud-edge-01"], "ge-0/0/2", "198.51.100.5/30", description="Cloud VPN outside")
atlas_vpn_outside = interface(devices["atlas-fw-01"], "wan1", "203.0.113.5/30", description="Managed-services VPN outside")

tunnel_group = save(
    TunnelGroup,
    {"slug": "showcase-hybrid-connectivity"},
    {"name": "Showcase Hybrid Connectivity", "description": "Sanitized site-to-site and hybrid connectivity"},
)
for name, tenant, a_interface, z_interface, description in [
    (
        "northstar-phoenix-to-reno",
        northstar,
        handoff_interfaces["EX-NS-DR-001"],
        reno_tunnel_outside,
        "Encrypted disaster-recovery overlay",
    ),
    (
        "summit-cloud-to-atlas-services",
        summit,
        summit_cloud_outside,
        atlas_vpn_outside,
        "Sanitized hybrid services overlay",
    ),
]:
    tunnel = save(
        Tunnel,
        {"name": name},
        {
            "tenant": tenant,
            "group": tunnel_group,
            "status": "active",
            "encapsulation": "ipsec-tunnel",
            "description": description,
        },
    )
    for endpoint in [a_interface, z_interface]:
        save(
            TunnelTermination,
            {
                "tunnel": tunnel,
                "termination_type": ContentType.objects.get_for_model(Interface),
                "termination_id": endpoint.pk,
            },
            {"role": "peer", "outside_ip": endpoint.ip_addresses.first()},
        )

print("SHOWCASE_SEED=complete")
print(f"SHOWCASE_TENANTS={Tenant.objects.filter(group=enterprise_group).count()}")
print(f"SHOWCASE_SITES={Site.objects.filter(tenant__group=enterprise_group).count()}")
print(f"SHOWCASE_RACKS={Rack.objects.filter(tenant__group=enterprise_group).count()}")
print(f"SHOWCASE_DEVICES={Device.objects.filter(tenant__group=enterprise_group).count()}")
