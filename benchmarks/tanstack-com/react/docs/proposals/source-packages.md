# Proposal: `-source` Companion Packages for AI Code Exploration

## Problem

AI agents (Claude, Cursor, Copilot, etc.) work best when they can grep and read actual source code. Our npm packages only contain built output (transpiled JS, type definitions), not the original TypeScript source.

Current workarounds:

- Clone repos to `/tmp` manually
- Ask the agent to clone and explore
- Read minified/transpiled code (poor results)

These are clunky and break the flow of AI-assisted development.

## Proposal

Publish companion `-source` packages alongside every TanStack library release:

```bash
# Normal install (built output, what runs in production)
npm install @tanstack/react-query@5.62.0

# Source install for AI exploration (dev only)
npm install @tanstack/react-query-source@5.62.0 --save-dev
```

The `-source` package contains the `src/` directory from the monorepo package (TypeScript and JavaScript source). It's not meant to be imported at runtime, only explored by AI agents.

## Structure

```
node_modules/@tanstack/react-query-source/
  src/
    useQuery.ts
    useMutation.ts
    QueryClient.ts
    ...
  package.json
```

## MCP Integration

The hosted MCP server gets a simple tool:

```typescript
get_source_instructions({ library: 'query' })
```

Returns:

```json
{
  "package": "@tanstack/react-query-source",
  "install": "npm install @tanstack/react-query-source@5.62.0 --save-dev",
  "explorePath": "node_modules/@tanstack/react-query-source/src/",
  "note": "Install this package to explore TanStack Query source code. Use your file tools to grep and read."
}
```

The agent installs the package, then uses its native file system tools (grep, read) to explore. No custom MCP tooling for search/read needed.

## Implementation

### 1. CI/CD Changes

On every release, publish two packages:

```yaml
# Pseudocode
- name: Publish main package
  run: npm publish

- name: Publish source package
  run: |
    # Create temp package with only src/
    cp -r src/ dist-source/src/
    cp package.json dist-source/
    # Modify package name to add -source suffix
    jq '.name += "-source"' dist-source/package.json > tmp && mv tmp dist-source/package.json
    # Modify files field to only include src/
    jq '.files = ["src"]' dist-source/package.json > tmp && mv tmp dist-source/package.json
    cd dist-source && npm publish
```

### 2. MCP Server Changes

Add one tool to the hosted MCP:

- `get_source_instructions` - Returns install command and explore path for a library

### 3. Documentation

Update MCP docs to explain the `-source` package convention.

## Benefits

1. **No local CLI needed** - Hosted MCP only, agents handle the rest
2. **Standard npm workflow** - No new tooling for developers to learn
3. **Version alignment** - Source version always matches installed version
4. **Works with any AI agent** - Just needs file system access
5. **Minimal overhead** - Source packages are small (just source files)

## Tradeoffs

1. **Double publish** - Every release publishes 2 packages per library
2. **npm registry usage** - More packages, though source packages are small
3. **Agent must run npm install** - One extra step, but agents already know how

## Alternatives Considered

### Local CLI that caches repos

Rejected: Adds complexity, requires users to install a CLI, duplicates what npm already does.

### Hosted grep API (Sourcegraph-backed)

Rejected: External dependency, rate limits, adds context overhead for every query.

### Include source in main package

Rejected: Bloats production installs, source isn't needed at runtime.

### GitHub raw content proxy via MCP

Rejected: Can't grep across files, need to know exact paths upfront.

## Open Questions

1. Should we include related packages? (e.g., `@tanstack/query-core` source in `@tanstack/react-query-source`)
2. What about monorepo-level files like shared utilities?
3. Should we include tests in the source package?

## Next Steps

1. Prototype the publish workflow for one library (react-query)
2. Test with Claude/Cursor to validate the agent experience
3. Roll out to all TanStack libraries
4. Add MCP tool and documentation
