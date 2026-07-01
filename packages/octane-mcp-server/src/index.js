#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const repoRoot = resolve(process.env.OCTANE_REPO_ROOT || process.cwd());

const SKILLS = {
  'react-library-port': '.ai/skills/react-library-port.md',
  'bug-hunter': '.ai/skills/bug-hunter.md',
  'create-a-pr': '.ai/skills/create-a-pr.md',
  'handle-issue': '.ai/skills/handle-issue.md',
  'octane-core-extend': '.ai/skills/octane-core-extend.md',
  triage: '.ai/skills/triage.md',
  'performance-audit': '.ai/skills/performance-audit.md',
};

function text(content) {
  return { content: [{ type: 'text', text: content }] };
}

function areaForPath(path) {
  if (path.startsWith('packages/octane/src/compiler/')) return 'compiler';
  if (path.startsWith('packages/octane/src/runtime') || path === 'packages/octane/src/index.ts') return 'core-runtime';
  if (path.startsWith('packages/octane/src/server/') || path.includes('runtime.server')) return 'ssr';
  if (path.startsWith('packages/octane/tests/')) return 'core-tests';
  if (path.startsWith('packages/vite-plugin-octane/')) return 'vite-plugin';
  if (/^packages\/(zustand|query|motion|stylex|router|lexical|floating-ui)\//.test(path)) return 'ecosystem-binding';
  if (path.startsWith('benchmarks/')) return 'benchmark';
  if (path.startsWith('docs/') || path.endsWith('.md')) return 'docs';
  if (path.startsWith('.ai/') || path.startsWith('.codex/') || path.startsWith('.claude/')) return 'agent-instructions';
  if (path.startsWith('.rulesync/')) return 'rulesync-source';
  return 'repo-tooling';
}

function validationFor(paths, taskKind) {
  const areas = new Set(paths.map(areaForPath));
  const commands = new Set();

  if (areas.has('rulesync-source')) commands.add('pnpm rules:generate');
  if (areas.has('core-runtime') || areas.has('compiler') || areas.has('ssr') || areas.has('core-tests')) {
    commands.add('./node_modules/.bin/vitest run packages/octane/tests --project octane');
  }
  if (areas.has('ecosystem-binding')) {
    for (const path of paths) {
      const match = path.match(/^packages\/([^/]+)\//);
      if (match) commands.add(`./node_modules/.bin/vitest run packages/${match[1]}/tests --project ${match[1]}`);
    }
  }
  if (areas.has('vite-plugin')) commands.add('pnpm typecheck');
  if (areas.has('benchmark') || taskKind === 'performance') commands.add('pnpm bench');
  if (taskKind === 'api' || taskKind === 'core' || taskKind === 'package') commands.add('pnpm typecheck');
  commands.add('pnpm format:check');

  return [...commands];
}

const server = new McpServer({ name: 'octane', version: '0.0.0' });

server.registerTool(
  'octane_project_map',
  {
    title: 'Octane project map',
    description: 'Return Octane repository map, source ownership, validation commands, and skill paths.',
    inputSchema: {},
  },
  async () => {
    const projectMap = await readFile(resolve(repoRoot, '.ai/project-map.md'), 'utf8');
    return text(projectMap);
  },
);

server.registerTool(
  'octane_skill',
  {
    title: 'Octane skill',
    description: 'Return a repository-local Octane agent skill by name.',
    inputSchema: {
      name: z.enum(Object.keys(SKILLS)),
    },
  },
  async ({ name }) => {
    const body = await readFile(resolve(repoRoot, SKILLS[name]), 'utf8');
    return text(body);
  },
);

server.registerTool(
  'octane_triage_paths',
  {
    title: 'Triage Octane paths',
    description: 'Classify changed paths by Octane repo area.',
    inputSchema: {
      paths: z.array(z.string()).describe('Repository-relative paths'),
    },
  },
  async ({ paths }) => {
    const rows = paths.map((path) => ({ path, area: areaForPath(path) }));
    return text(JSON.stringify({ repoRoot, paths: rows }, null, 2));
  },
);

server.registerTool(
  'octane_validate_plan',
  {
    title: 'Octane validation plan',
    description: 'Recommend validation commands for changed paths and task kind.',
    inputSchema: {
      paths: z.array(z.string()).default([]).describe('Repository-relative changed paths'),
      taskKind: z
        .enum(['bug', 'feature', 'docs', 'test', 'performance', 'core', 'compiler', 'package', 'api', 'unknown'])
        .default('unknown'),
    },
  },
  async ({ paths, taskKind }) => {
    return text(JSON.stringify({ repoRoot, taskKind, commands: validationFor(paths, taskKind) }, null, 2));
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
