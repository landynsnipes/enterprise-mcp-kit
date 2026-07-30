"""Native default dashboard for the Enterprise MCP Kit NetBox distribution."""

DEFAULT_DASHBOARD = [
    {
        "widget": "extras.NoteWidget", "width": 12, "height": 2,
        "title": "Enterprise Source of Truth", "color": "blue",
        "config": {"content": (
            "Use NetBox as the intended-state source of truth for infrastructure. "
            "The included MCP tools provide read-only device, site, and direct "
            "connectivity evidence; they do not prove live forwarding state."
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
            "**Read-only tools**\n\n- `get_device_context`\n- `get_site_overview`\n"
            "- `get_connectivity_path`\n\nUse a dedicated write-disabled API token."
        )},
    },
    {
        "widget": "extras.BookmarksWidget", "width": 4, "height": 3,
        "title": "Operator Bookmarks", "color": "gray",
    },
]
