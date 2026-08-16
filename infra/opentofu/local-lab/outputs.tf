output "site_contract" {
  description = "Logical site contract; both sites intentionally share one physical WSL failure domain."
  value       = { for key, site in terraform_data.site_contract : key => site.output }
}

output "governance_boundary" {
  value = "plan -> human approval -> bounded execution -> telemetry verification -> rollback"
}
