terraform {
  required_version = "= 1.12.1"
}

locals {
  sites = {
    las = { name = "Las Vegas", role = "primary", workload_cidr = "10.60.0.0/24" }
    chi = { name = "Chicago", role = "recovery", workload_cidr = "10.70.0.0/24" }
  }
}

resource "terraform_data" "site_contract" {
  for_each = local.sites
  input = {
    site_id       = each.key
    display_name  = each.value.name
    role          = each.value.role
    workload_cidr = each.value.workload_cidr
    physical_domain = "shared-wsl-host"
  }

  lifecycle {
    precondition {
      condition     = each.value.role != "primary" || each.key == "las"
      error_message = "The evaluation contract requires LAS to remain the declared primary site."
    }
  }
}
