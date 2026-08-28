import { DocImpactEngine } from '../engine/runtime.js';
import type { EngineWorkspaceConfig } from '../engine/runtime.js';
import type { ImpactRule } from '../config/types.js';
import { createWorkspaceConfigSource } from './config-source.js';
import { resolvePluginConfig, type DocImpactPluginConfig } from './plugin-config.js';
import { registerLifecycle } from './lifecycle.js';
import { createResolveTool, createStatusTool } from './tools.js';
import { createDocImpactCommand } from './commands.js';

export const name = 'doc-impact';

/** The tools service is required; commands and the web UI are optional services. */
export const inject = ['tools'] as const;

export interface PluginContext {
  on(event: string, listener: (...args: never[]) => unknown): unknown;
  inject(services: readonly string[], callback: (ctx: any) => void): unknown;
  tools: {
    register(definition: unknown): () => void;
  };
  agents?: {
    list(): readonly {
      readonly id: string;
      readonly status: 'idle' | 'running';
      readonly session: { readonly header?: { readonly cwd?: string } };
    }[];
  };
  logger: {
    info(message: string, ...values: unknown[]): void;
    warn(message: string, ...values: unknown[]): void;
    error(message: string, ...values: unknown[]): void;
  };
}

/**
 * dsh-doc-impact plugin entry (SPEC §14, §64): load config, wire the engine to
 * the public `agent/*` and `session/*` extension points, register the
 * `doc_impact_*` tools and the `/doc-impact` command. No agent-loop internals
 * are imported or patched (SPEC §92-§93).
 */
export function apply(ctx: PluginContext, rawConfig?: unknown): void {
  let pluginConfig: DocImpactPluginConfig;
  try {
    pluginConfig = resolvePluginConfig(rawConfig);
  } catch (error) {
    ctx.logger.error('dsh-doc-impact: invalid plugin config, plugin disabled\n%s', error);
    return;
  }
  if (!pluginConfig.enabled) {
    ctx.logger.info('dsh-doc-impact: disabled by plugin config');
    return;
  }

  const logger = ctx.logger;
  const loadWorkspaceConfig = createWorkspaceConfigSource(pluginConfig, logger);
  const engine = new DocImpactEngine({
    configProvider: (cwd: string): Promise<EngineWorkspaceConfig | undefined> => loadWorkspaceConfig(cwd),
    logger,
    concurrentAgents: (cwd: string): number =>
      ctx.agents?.list().filter(
        (agent) => agent.status === 'running' && agent.session.header?.cwd === cwd,
      ).length ?? 1,
  });

  registerLifecycle(ctx, engine);

  ctx.tools.register(createResolveTool({ engine }));
  ctx.tools.register(createStatusTool({ engine }));

  const rulesFor = async (cwd: string): Promise<ImpactRule[]> => {
    const workspace = await loadWorkspaceConfig(cwd);
    return workspace?.config.rules ?? [];
  };

  const command = createDocImpactCommand(engine, { rulesFor });
  ctx.inject(['commands'], (commandCtx: any) => {
    commandCtx.commands.register(command);
  });

  ctx.logger.info('dsh-doc-impact: active (workspace config: %s)', pluginConfig.configFile);
}
