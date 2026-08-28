import { ConfigError } from '../config/errors.js';

export interface DocImpactPluginConfig {
  enabled: boolean;
  /** Workspace config path relative to the session cwd (SPEC §8, §37). */
  configFile: string;
  /** Fallback default mode for rules that declare none (SPEC §37). */
  defaultsMode: 'remind' | 'require-review' | 'require-resolution' | 'require-update';
  safety: { maxReminderRounds: number; onLimit: 'allow' | 'warn' | 'error' };
  maxSnapshotFiles: number;
  debug: boolean;
}

interface RawPluginConfig {
  enabled?: unknown;
  configFile?: unknown;
  defaults?: unknown;
  safety?: unknown;
  changeDetection?: unknown;
  debug?: unknown;
}

const ON_LIMIT = ['allow', 'warn', 'error'] as const;
const MODES = ['remind', 'require-review', 'require-resolution', 'require-update'] as const;

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ConfigError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

/**
 * Plugin-level configuration (SPEC §37). Strict like first-party dsh plugins:
 * unknown keys fail at activation instead of being ignored silently.
 */
export function resolvePluginConfig(raw: unknown): DocImpactPluginConfig {
  const config = expectRecord(raw, 'plugin config');
  const unknown = Object.keys(config).filter(
    (key) => !['enabled', 'configFile', 'defaults', 'safety', 'changeDetection', 'debug'].includes(key),
  );
  if (unknown.length > 0) {
    throw new ConfigError(`plugin config has unknown key(s): ${unknown.join(', ')}`);
  }

  if (config.enabled !== undefined && typeof config.enabled !== 'boolean') {
    throw new ConfigError('enabled must be a boolean');
  }
  if (config.configFile !== undefined && (typeof config.configFile !== 'string' || config.configFile.trim() === '')) {
    throw new ConfigError('configFile must be a non-empty string');
  }
  if (config.debug !== undefined && typeof config.debug !== 'boolean') {
    throw new ConfigError('debug must be a boolean');
  }

  const defaults = expectRecord(config.defaults, 'defaults');
  if (defaults.mode !== undefined && (typeof defaults.mode !== 'string' || !MODES.includes(defaults.mode as never))) {
    throw new ConfigError(`defaults.mode must be one of: ${MODES.join(', ')}`);
  }

  const safety = expectRecord(config.safety, 'safety');
  if (safety.onLimit !== undefined && (typeof safety.onLimit !== 'string' || !ON_LIMIT.includes(safety.onLimit as never))) {
    throw new ConfigError(`safety.onLimit must be one of: ${ON_LIMIT.join(', ')}`);
  }
  if (safety.maxReminderRounds !== undefined) {
    const rounds = safety.maxReminderRounds;
    if (typeof rounds !== 'number' || !Number.isInteger(rounds) || rounds < 1) {
      throw new ConfigError('safety.maxReminderRounds must be a positive integer');
    }
  }

  const changeDetection = expectRecord(config.changeDetection, 'changeDetection');
  let maxSnapshotFiles = 10_000;
  if (changeDetection.maxSnapshotFiles !== undefined) {
    const maxFiles = changeDetection.maxSnapshotFiles;
    if (typeof maxFiles !== 'number' || !Number.isInteger(maxFiles) || maxFiles < 1) {
      throw new ConfigError('changeDetection.maxSnapshotFiles must be a positive integer');
    }
    maxSnapshotFiles = maxFiles;
  }

  return {
    enabled: config.enabled ?? true,
    configFile: config.configFile ?? '.dsh/doc-impact.yml',
    defaultsMode: (defaults.mode as DocImpactPluginConfig['defaultsMode']) ?? 'remind',
    safety: {
      maxReminderRounds: (safety.maxReminderRounds as number) ?? 2,
      onLimit: (safety.onLimit as DocImpactPluginConfig['safety']['onLimit']) ?? 'allow',
    },
    maxSnapshotFiles,
    debug: config.debug ?? false,
  };
}
