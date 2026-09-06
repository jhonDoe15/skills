'use strict';

const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const MAX_OUTPUT_BYTES = 64 * 1024;

class TrustedVerificationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TrustedVerificationError';
  }
}

function requireDirectory(value, field) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    throw new TrustedVerificationError(`${field} must be an absolute path`);
  }
  let status;
  try {
    status = fs.lstatSync(value);
  } catch {
    throw new TrustedVerificationError(`${field} does not exist`);
  }
  if (!status.isDirectory() || status.isSymbolicLink()) {
    throw new TrustedVerificationError(`${field} must be a regular directory`);
  }
  return fs.realpathSync(value);
}

function directoryDigest(root) {
  const hash = createHash('sha256');
  function visit(relative = '') {
    const directory = path.join(root, relative);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      if (relative === '' && entry.name === '.git') continue;
      const entryRelative = path.join(relative, entry.name);
      const normalized = entryRelative.split(path.sep).join('/');
      if (entry.isSymbolicLink()) {
        throw new TrustedVerificationError(
          `verification input contains symlink "${normalized}"`,
        );
      }
      if (entry.isDirectory()) {
        hash.update(`directory\0${normalized}\0`);
        visit(entryRelative);
      } else if (entry.isFile()) {
        hash.update(`file\0${normalized}\0`);
        hash.update(fs.readFileSync(path.join(root, entryRelative)));
        hash.update('\0');
      } else {
        throw new TrustedVerificationError(
          `verification input contains unsupported entry "${normalized}"`,
        );
      }
    }
  }
  visit();
  return hash.digest('hex');
}

function capped(buffer) {
  if (buffer.length <= MAX_OUTPUT_BYTES) return buffer.toString('utf8');
  return `${buffer.subarray(0, MAX_OUTPUT_BYTES).toString('utf8')}\n[truncated]`;
}

function dockerSandboxExecutor({
  image = 'node:22-alpine',
  timeoutMs = 5 * 60 * 1000,
} = {}) {
  return function executeSandbox(request) {
    return new Promise((resolve, reject) => {
      const args = [
        'run',
        '--rm',
        '--network',
        request.network,
        '--read-only',
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges',
        '--pids-limit',
        String(request.pidsLimit),
        '--memory',
        `${request.memoryMb}m`,
        '--cpus',
        String(request.cpus),
        '--user',
        '65534:65534',
        '--mount',
        `type=bind,src=${request.workspace},dst=/workspace,readonly`,
        '--mount',
        `type=bind,src=${request.hiddenTests},dst=/hidden,readonly`,
        '--tmpfs',
        '/tmp:rw,noexec,nosuid,size=64m',
        '--workdir',
        '/workspace',
        image,
        'sh',
        '-lc',
        request.command,
      ];
      const child = spawn('docker', args, {
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          DOCKER_CONFIG: process.env.DOCKER_CONFIG,
          DOCKER_CONTEXT: process.env.DOCKER_CONTEXT,
          DOCKER_HOST: process.env.DOCKER_HOST,
          DOCKER_TLS_VERIFY: process.env.DOCKER_TLS_VERIFY,
          DOCKER_CERT_PATH: process.env.DOCKER_CERT_PATH,
          CI: 'true',
          NO_COLOR: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const stdout = [];
      const stderr = [];
      child.stdout.on('data', (chunk) => stdout.push(chunk));
      child.stderr.on('data', (chunk) => stderr.push(chunk));
      const startedAt = Date.now();
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
      }, timeoutMs);
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('close', (exitCode, signal) => {
        clearTimeout(timer);
        resolve({
          exitCode: Number.isInteger(exitCode) ? exitCode : 1,
          signal: signal || null,
          stdout: capped(Buffer.concat(stdout)),
          stderr: capped(Buffer.concat(stderr)),
          durationMs: Date.now() - startedAt,
        });
      });
    });
  };
}

function normalizedCommands(commands) {
  if (!Array.isArray(commands) || commands.length === 0 || commands.length > 16) {
    throw new TrustedVerificationError(
      'commands must contain between 1 and 16 entries',
    );
  }
  return commands.map((command, index) => {
    if (typeof command !== 'string'
      || command.length === 0
      || command.length > 1024
      || /[\r\n]/.test(command)) {
      throw new TrustedVerificationError(`commands[${index}] is invalid`);
    }
    return command;
  });
}

function isWithinDirectory(directory, candidate) {
  const relative = path.relative(directory, candidate);
  return relative === ''
    || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function normalizedSandboxResult(command, result) {
  return {
    command,
    exitCode: result.exitCode,
    signal: result.signal || null,
    stdout: String(result.stdout || '').slice(0, MAX_OUTPUT_BYTES),
    stderr: String(result.stderr || '').slice(0, MAX_OUTPUT_BYTES),
    durationMs: result.durationMs,
    passed: result.exitCode === 0,
  };
}

function createTrustedVerifier({
  executeSandbox = dockerSandboxExecutor(),
  memoryMb = 512,
  cpus = 1,
  pidsLimit = 128,
} = {}) {
  if (typeof executeSandbox !== 'function') {
    throw new TypeError('trusted verifier executeSandbox must be a function');
  }
  return Object.freeze({
    async verify(request) {
      const workspace = requireDirectory(request.workspace, 'workspace');
      const hiddenTests = requireDirectory(request.hiddenTests, 'hiddenTests');
      if (isWithinDirectory(workspace, hiddenTests)) {
        throw new TrustedVerificationError(
          'hiddenTests must remain outside the agent workspace',
        );
      }
      const commands = normalizedCommands(request.commands);
      const beforeDigest = directoryDigest(workspace);
      const isolation = {
        network: 'none',
        readOnlyRoot: true,
        workspaceMode: 'read-only',
        memoryMb,
        cpus,
        pidsLimit,
      };
      const results = [];
      for (const command of commands) {
        const result = await executeSandbox({
          command,
          workspace,
          hiddenTests,
          ...isolation,
        });
        results.push(normalizedSandboxResult(command, result));
        if (result.exitCode !== 0) break;
      }
      const afterDigest = directoryDigest(workspace);
      if (beforeDigest !== afterDigest) {
        throw new TrustedVerificationError(
          'trusted verification mutated the workspace',
        );
      }
      return Object.freeze({
        passed: results.length === commands.length
          && results.every(({ passed }) => passed),
        workspaceDigest: beforeDigest,
        hiddenTestsDigest: directoryDigest(hiddenTests),
        isolation,
        results: Object.freeze(results.map(Object.freeze)),
      });
    },
  });
}

module.exports = {
  TrustedVerificationError,
  createTrustedVerifier,
  dockerSandboxExecutor,
};
