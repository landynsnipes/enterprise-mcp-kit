# Zabbix availability slice

This native-WSL Compose project runs pinned Zabbix 7.4.7 server and web
containers with a dedicated PostgreSQL database. It monitors one bounded job:
whether the LAS ↔ CHI WireGuard service is available according to the observer's
read-only `/api/status` evidence.

Prometheus remains authoritative for metric rules, handshake age, approved-path
reachability, and policy-boundary alerts. Zabbix owns the complementary
host/service availability trigger only. No Zabbix API or generic monitoring
operation is exposed to an LLM.

The three containers use host networking so the Zabbix server can query the
observer bound to WSL loopback. PostgreSQL and the Zabbix server themselves bind
only to `127.0.0.1`; the web frontend is reachable at <http://localhost:8080/>.
This remains a local single-host proof, not physical two-site HA.

Runtime passwords belong only in ignored `.env` and `.runtime/` files. Copy
`.env.example` to `.env`, replace both placeholder values with independent
random secrets, validate with `docker compose config --quiet`, then start the
systemd unit. The bootstrap is fixed-schema, idempotent, and changes the default
Zabbix administrator password before reporting success.
