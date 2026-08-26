'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_MAX_DEFINITIONS = 256;
const HASH_CHUNK_BYTES = 64 * 1024;

function sha256(value = '') {
  return createHash('sha256').update(value).digest('hex');
}

function emptyPreExecutionInventory() {
  return {
    skillDefinitions: [],
    plugins: [],
    ruleSources: [],
    packageDigest: sha256(),
    truncated: false,
  };
}

function digestRegularFile(filePath) {
  const stats = fs.lstatSync(filePath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`Inventory source is not a regular file: ${filePath}`);
  }
  const descriptor = fs.openSync(filePath, 'r');
  const digest = createHash('sha256');
  const chunk = Buffer.alloc(HASH_CHUNK_BYTES);
  try {
    let bytesRead;
    do {
      bytesRead = fs.readSync(descriptor, chunk, 0, chunk.length, null);
      if (bytesRead > 0) digest.update(chunk.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return digest.digest('hex');
}

function buildPreExecutionInventory({
  projectRoot,
  skillNames,
  relativePathFor,
  plugins = [],
  ruleSources = [],
  maxDefinitions = DEFAULT_MAX_DEFINITIONS,
}) {
  if (!Number.isInteger(maxDefinitions) || maxDefinitions < 0) {
    throw new TypeError('maxDefinitions must be a non-negative integer');
  }
  const packageDigest = createHash('sha256');
  const skillDefinitions = [];
  const seen = new Set();
  for (const name of skillNames) {
    if (typeof name !== 'string'
      || !/^[a-z0-9-]+$/.test(name)
      || seen.has(name)) {
      throw new TypeError(`Invalid inventory Skill name: ${String(name)}`);
    }
    seen.add(name);
    const relativePath = relativePathFor(name).split(path.sep).join('/');
    const absolutePath = path.resolve(projectRoot, relativePath);
    const workspacePath = path.relative(projectRoot, absolutePath);
    if (path.isAbsolute(relativePath)
      || workspacePath === '..'
      || workspacePath.startsWith(`..${path.sep}`)) {
      throw new Error(`Inventory path escapes project: ${relativePath}`);
    }
    const digest = digestRegularFile(absolutePath);
    packageDigest.update(JSON.stringify([name, digest]));
    packageDigest.update('\n');
    if (skillDefinitions.length < maxDefinitions) {
      skillDefinitions.push({ name, path: relativePath, digest });
    }
  }

  const retainedPlugins = plugins.slice(0, maxDefinitions);
  const retainedRuleSources = ruleSources.slice(0, maxDefinitions);
  return {
    skillDefinitions,
    plugins: retainedPlugins,
    ruleSources: retainedRuleSources,
    packageDigest: packageDigest.digest('hex'),
    truncated: skillDefinitions.length < skillNames.length
      || retainedPlugins.length < plugins.length
      || retainedRuleSources.length < ruleSources.length,
  };
}

function retainPreExecutionInventory(inventory) {
  return {
    skill_definitions: structuredClone(inventory.skillDefinitions),
    plugins: [...inventory.plugins],
    rule_sources: [...inventory.ruleSources],
    package_digest: inventory.packageDigest,
    truncated: inventory.truncated,
  };
}

function normalizeRetainedPreExecutionInventory(inventory) {
  return {
    skillDefinitions: structuredClone(inventory.skill_definitions),
    plugins: [...inventory.plugins],
    ruleSources: [...inventory.rule_sources],
    packageDigest: inventory.package_digest,
    truncated: inventory.truncated,
  };
}

module.exports = {
  buildPreExecutionInventory,
  emptyPreExecutionInventory,
  normalizeRetainedPreExecutionInventory,
  retainPreExecutionInventory,
};
