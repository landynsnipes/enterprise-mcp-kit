# Enterprise MCP Kit releases and packages

Enterprise MCP Kit publishes a versioned Node.js package to GitHub Packages.
The package contains the six bounded stdio connector commands:

- enterprise-mcp-netbox
- enterprise-mcp-grafana
- enterprise-mcp-zabbix
- enterprise-mcp-wireguard
- enterprise-mcp-kubernetes
- enterprise-mcp-opnsense

GitHub Releases remain the authoritative version record. The package is an
integration artifact and does not by itself certify a production deployment,
vendor compatibility, or autonomous remediation.

## Install

Create a token with read:packages and configure the owner scope:

    npm config set @landynsnipes:registry https://npm.pkg.github.com
    npm install @landynsnipes/enterprise-mcp-kit@0.2.1

For a project-local .npmrc:

    @landynsnipes:registry=https://npm.pkg.github.com

Keep credentials in NODE_AUTH_TOKEN or another secret store. Never commit a
token, .npmrc credentials, production URLs, or customer data.

## Maintainer release procedure

1. Update package.json, package-lock.json, and CHANGELOG.md with the same
   semantic version.
2. Run npm ci, npm run validate, npm run pack:check, and review git diff --check.
3. Create an annotated tag matching package.json:

       git tag -a v0.2.1 -m "Release enterprise-mcp-kit v0.2.1"
       git push origin main --follow-tags

4. Create and publish a GitHub Release from that tag.
5. The release workflow validates the package and publishes it with the
   repository GITHUB_TOKEN.
6. Verify the release page, package page, package contents, and install path
   from a clean temporary project.

The workflow does not store a personal access token in the repository. The
release gate separately builds the production reference image, generates SBOM
evidence, and scans for high or critical vulnerabilities.

## Package contents

The package allowlist includes compiled connector code under dist/src, connector
documentation, the MCP example, the license, security policy, changelog, and
README. Tests, source TypeScript, local environment files, credentials, and
development caches are excluded.

## Rollback and support

If a published version is defective, publish a corrected patch release and mark
the affected GitHub Release as superseded. Do not silently mutate a published
version. Follow SECURITY.md for vulnerability reports.
