import json

from circuits.models import Circuit, CircuitTermination
from dcim.models import Cable, Device, Platform, PowerFeed, PowerOutlet, Rack, Site
from extras.models import CustomField
from ipam.models import IPAddress, Prefix, Service, VLAN, VRF
from tenancy.models import ContactAssignment, Tenant
from virtualization.models import Cluster, VirtualMachine
from vpn.models import Tunnel, TunnelTermination

expected_tenants = {"Northstar Financial", "Summit Digital", "Atlas Managed Services"}
actual_tenants = set(Tenant.objects.filter(group__slug="showcase-organizations").values_list("name", flat=True))
assert actual_tenants == expected_tenants

expected_devices = {
    "ns-phx-edge-01",
    "ns-phx-fw-01",
    "ns-phx-core-01",
    "ns-phx-app-01",
    "ns-phx-app-02",
    "ns-reno-edge-01",
    "ns-reno-app-01",
    "sum-cloud-edge-01",
    "sum-platform-01",
    "atlas-core-01",
    "atlas-fw-01",
}
assert expected_devices.issubset(set(Device.objects.values_list("name", flat=True)))

for name in ["ns-phx-edge-01", "sum-cloud-edge-01", "atlas-core-01"]:
    dev = Device.objects.get(name=name)
    assert dev.tenant is not None
    assert dev.site is not None
    assert dev.rack is not None
    assert dev.primary_ip4 is not None
    assert dev.interfaces.filter(name="mgmt0").exists()
    assert dev.powerports.filter(name="PSU-A").exists()
    assert dev.powerports.filter(name="PSU-B").exists()

assert Site.objects.filter(tenant__group__slug="showcase-organizations").count() >= 5
assert Rack.objects.filter(tenant__group__slug="showcase-organizations").count() >= 5
assert Device.objects.filter(tenant__group__slug="showcase-organizations").count() >= 21
assert PowerFeed.objects.filter(tenant__group__slug="showcase-organizations").count() >= 10
assert PowerOutlet.objects.filter(device__tenant__group__slug="showcase-organizations").count() >= 80
assert Cable.objects.filter(tenant__group__slug="showcase-organizations", status="connected").count() >= 30
assert Cable.objects.filter(label__startswith="PHX-NET-", status="connected").count() == 4
assert ContactAssignment.objects.filter(object_type__app_label="dcim", object_type__model="site").count() >= 5
assert Circuit.objects.filter(tenant__group__slug="showcase-organizations").count() >= 4
assert VRF.objects.filter(tenant__group__slug="showcase-organizations").count() >= 3
assert VLAN.objects.filter(tenant__group__slug="showcase-organizations").count() >= 3
assert Prefix.objects.filter(tenant__group__slug="showcase-organizations").count() >= 3
assert IPAddress.objects.filter(tenant__group__slug="showcase-organizations").count() >= 13
assert Cluster.objects.filter(tenant__group__slug="showcase-organizations").count() >= 1
assert VirtualMachine.objects.filter(tenant__group__slug="showcase-organizations").count() >= 3
assert Platform.objects.filter(slug__in=["example-network-os", "example-secure-os", "enterprise-linux", "example-facility-firmware"]).count() == 4
assert CustomField.objects.filter(name__in=["observed_software_version", "minimum_approved_version", "version_compliance", "version_evidence_source", "version_observed_at", "workload_software_versions", "redundancy_group", "failure_domain", "reconciliation_status"]).count() == 9
assert Device.objects.filter(tenant__group__slug="showcase-organizations", platform__isnull=False).count() >= 21
assert Service.objects.filter(parent_object_type__app_label="dcim", parent_object_type__model="device").count() >= 5
assert CircuitTermination.objects.filter(circuit__tenant__group__slug="showcase-organizations", term_side="A", termination_type__app_label="dcim", termination_type__model="interface").count() >= 4
assert Tunnel.objects.filter(group__slug="showcase-hybrid-connectivity", status="active").count() == 2
assert TunnelTermination.objects.filter(tunnel__group__slug="showcase-hybrid-connectivity").count() == 4
for name in ["ns-phx-app-01", "ns-phx-app-02", "ns-reno-edge-01", "sum-cloud-edge-01"]:
    dev = Device.objects.get(name=name)
    assert dev.custom_field_data["observed_software_version"]
    assert dev.custom_field_data["reconciliation_status"] == "matched"
    assert dev.custom_field_data["minimum_approved_version"]
    assert dev.custom_field_data["version_compliance"] == "meets-example-policy"
    assert dev.custom_field_data["version_evidence_source"] == "sanitized-lab-seed"
    assert dev.custom_field_data["redundancy_group"]
    assert dev.custom_field_data["failure_domain"]
for name in ["summit-control-01", "summit-worker-01", "summit-worker-02"]:
    vm = VirtualMachine.objects.get(name=name)
    assert vm.platform.slug == "enterprise-linux"
    assert vm.custom_field_data["observed_software_version"] == "9.6"
    assert vm.custom_field_data["minimum_approved_version"] == "9.5"
    assert vm.custom_field_data["version_compliance"] == "meets-example-policy"
    assert "Kubernetes" in vm.custom_field_data["workload_software_versions"]
    assert vm.custom_field_data["version_evidence_source"] == "sanitized-lab-seed"
cluster = Cluster.objects.get(name="summit-prod-west")
assert cluster.custom_field_data["observed_software_version"] == "1.34.1"
assert cluster.custom_field_data["minimum_approved_version"] == "1.33.0"
assert "Kubernetes 1.34.1" in cluster.custom_field_data["workload_software_versions"]

summary = {
    "result": "passed",
    "tenants": Tenant.objects.filter(group__slug="showcase-organizations").count(),
    "sites": Site.objects.filter(tenant__group__slug="showcase-organizations").count(),
    "racks": Rack.objects.filter(tenant__group__slug="showcase-organizations").count(),
    "devices": Device.objects.filter(tenant__group__slug="showcase-organizations").count(),
    "powerFeeds": PowerFeed.objects.filter(tenant__group__slug="showcase-organizations").count(),
    "powerOutlets": PowerOutlet.objects.filter(device__tenant__group__slug="showcase-organizations").count(),
    "connectedCables": Cable.objects.filter(tenant__group__slug="showcase-organizations", status="connected").count(),
    "circuits": Circuit.objects.filter(tenant__group__slug="showcase-organizations").count(),
    "siteContacts": ContactAssignment.objects.filter(object_type__app_label="dcim", object_type__model="site").count(),
    "vrfs": VRF.objects.filter(tenant__group__slug="showcase-organizations").count(),
    "vlans": VLAN.objects.filter(tenant__group__slug="showcase-organizations").count(),
    "prefixes": Prefix.objects.filter(tenant__group__slug="showcase-organizations").count(),
    "ipAddresses": IPAddress.objects.filter(tenant__group__slug="showcase-organizations").count(),
    "clusters": Cluster.objects.filter(tenant__group__slug="showcase-organizations").count(),
    "virtualMachines": VirtualMachine.objects.filter(tenant__group__slug="showcase-organizations").count(),
    "platforms": Platform.objects.filter(slug__in=["example-network-os", "example-secure-os", "enterprise-linux", "example-facility-firmware"]).count(),
    "services": Service.objects.filter(parent_object_type__app_label="dcim", parent_object_type__model="device").count(),
    "circuitHandoffs": CircuitTermination.objects.filter(circuit__tenant__group__slug="showcase-organizations", term_side="A", termination_type__app_label="dcim", termination_type__model="interface").count(),
    "tunnels": Tunnel.objects.filter(group__slug="showcase-hybrid-connectivity", status="active").count(),
    "tunnelTerminations": TunnelTermination.objects.filter(tunnel__group__slug="showcase-hybrid-connectivity").count(),
    "versionedVirtualMachines": VirtualMachine.objects.filter(name__in=["summit-control-01", "summit-worker-01", "summit-worker-02"], platform__isnull=False).count(),
    "versionedClusters": Cluster.objects.filter(name="summit-prod-west").count(),
}
print("SHOWCASE_VERIFY=" + json.dumps(summary, sort_keys=True))
