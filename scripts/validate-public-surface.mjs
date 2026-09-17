#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));
const readme = await readFile(path.join(repositoryRoot, 'README.md'), 'utf8');
const changelog = await readFile(path.join(repositoryRoot, 'CHANGELOG.md'), 'utf8');
const license = await readFile(path.join(repositoryRoot, 'LICENSE'), 'utf8');

const requiredFiles = [
  'README.md',
  'LICENSE',
  'CHANGELOG.md',
  'SECURITY.md',
  'docs/compatibility.md',
  'docs/bounded-mcp-connectors.md',
];
const errors = [];

for (const relative of requiredFiles) {
  try {
    await readFile(path.join(repositoryRoot, relative));
  } catch {
    errors.push(`missing public-surface file: ${relative}`);
  }
}

if (packageJson.license !== 'Apache-2.0') errors.push('package.json must declare Apache-2.0');
if (!packageJson.repository?.url?.includes('github.com/landynsnipes/enterprise-mcp-kit')) {
  errors.push('package.json repository URL must identify the public GitHub repository');
}
if (!Array.isArray(packageJson.keywords) || packageJson.keywords.length < 5) {
  errors.push('package.json must expose at least five discoverable keywords');
}
if (!/actions\/workflows\/validate\.yml\/badge\.svg/.test(readme)) {
  errors.push('README.md must show the validation workflow badge');
}
if (!/Apache License 2\.0/.test(readme)) errors.push('README.md must state the Apache License 2.0');
if (!/^## 0\.2\.1 - 2026-09-16/m.test(changelog)) {
  errors.push('CHANGELOG.md must document the 0.2.1 public-surface release');
}
if (!/Apache License\s+Version 2\.0/.test(license)) errors.push('LICENSE must contain the canonical Apache 2.0 text');

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Public surface validation passed for ${packageJson.name}@${packageJson.version}.`);
}
