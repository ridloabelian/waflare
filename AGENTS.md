# AGENTS.md — AI Coding Agent Field Guide for `waflare`

`waflare` is designed to be operated, inspected, and extended autonomously by coding agents (Claude Code, Codex, Cursor, Antigravity) while running identically on Cloudflare Workers and Node.js 22+.

## Runtime Invariants (Do Not Break)
1. **Erasable TypeScript Only**: Keep all files compatible with Node 22 `--experimental-strip-types`. Do not introduce `enum`, `namespace`, or constructor parameter properties (`constructor(private x)`). Use string literal union types and explicit class fields.
2. **Explicit `.ts` Extensions**: Every relative import must include `.ts` (`import { ... } from "./types.ts"`).
3. **Zero Runtime Dependencies**: Keep `src/` strictly dependent on Web Standard APIs (`Request`, `Response`, `URL`, `crypto.subtle`, `TextEncoder`, `fetch`) so deployments never fail on npm resolution or heavy Node polyfills.
4. **Clean-Room MIT Guarantee**: Never paste GPL/AGPL code from external repositories into `src/`. Implement behaviors cleanly from public protocol specifications.

## Key Extension Points
- Add new vertical agent skills under `src/skills/` and register their slash commands in `src/agents/orchestrator.ts`.
- Add new MCP tools in `src/mcp/tools.ts` (`TOOLS` definition + handler switch), remembering to classify mutating tools accurately with `readOnly: false` so `MCP_READ_ONLY=true` protects user data.
- Run `npm test` after every change (`node --experimental-strip-types --test tests/*.test.ts`).
