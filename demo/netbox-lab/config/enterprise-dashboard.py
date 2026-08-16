"""Native default dashboard for the Enterprise MCP Kit NetBox distribution."""

DEFAULT_DASHBOARD = [
    {
        "widget": "extras.NoteWidget", "width": 12, "height": 2,
        "title": "Enterprise Source of Truth", "color": "blue",
        "config": {"content": (
            "Use NetBox as the intended-state source of truth for infrastructure. "
            "The public MCP is read-only. Authenticated changes use a separate "
            "plan, human-approval, execution, audit, and rollback gateway; "
            "neither path proves live forwarding or electrical state."
        )},
    },
    {
        "widget": "extras.ObjectCountsWidget", "width": 4, "height": 3,
        "title": "Organization & Sites", "color": "blue",
        "config": {"models": ["tenancy.tenant", "dcim.site", "dcim.location", "tenancy.contact"]},
    },
    {
        "widget": "extras.ObjectCountsWidget", "width": 4, "height": 3,
        "title": "Physical & Virtual Infrastructure", "color": "green",
        "config": {"models": ["dcim.rack", "dcim.device", "virtualization.cluster", "virtualization.virtualmachine"]},
    },
    {
        "widget": "extras.ObjectCountsWidget", "width": 4, "height": 3,
        "title": "Connectivity & IPAM", "color": "purple",
        "config": {"models": ["circuits.circuit", "vpn.tunnel", "ipam.vrf", "ipam.prefix", "ipam.vlan", "ipam.ipaddress"]},
    },
    {
        "widget": "extras.ObjectCountsWidget", "width": 4, "height": 3,
        "title": "Power, Cabling & Services", "color": "orange",
        "config": {"models": ["dcim.powerfeed", "dcim.cable", "ipam.service"]},
    },
    {
        "widget": "extras.NoteWidget", "width": 4, "height": 3,
        "title": "MCP Readiness", "color": "teal",
        "config": {"content": (
            "**Public MCP: read-only**\n\n- `get_device_context`\n- `get_site_overview`\n"
            "- `get_connectivity_path`\n- `get_rack_context`\n- `get_power_path`\n\n"
            "**Governed gateway: authenticated**\n\nInventory changes require a tenant-scoped "
            "plan, separate human approval, exact preconditions, audit, and rollback. "
            "Use a dedicated write-disabled token for the public MCP."
        )},
    },
    {
        "widget": "extras.BookmarksWidget", "width": 4, "height": 3,
        "title": "Operator Bookmarks", "color": "gray",
    },
]
