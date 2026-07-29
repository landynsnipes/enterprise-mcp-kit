# Repository Guidance

This repository is a reusable foundation for enterprise MCP connectors. The initial reference integration is NetBox.

- Design tools around bounded user jobs, not raw vendor endpoints.
- Default to read-only access. Any future write action requires explicit human confirmation, narrow authorization, and auditability.
- Never commit tokens, production URLs, customer data, or real infrastructure inventory.
- Keep adapter logic, tool schemas, tests, and deployment guidance separate.
