# Repository Guidelines

## Purpose

This project provides a batch JavaScript runtime and persistent daemon for agent-driven WeChat Mini Program automation.

## Architecture

- `src/cli.ts`: CLI entrypoint and daemon lifecycle.
- `src/daemon.ts` / `src/rpc-client.ts`: newline-delimited JSON RPC over a local Unix socket.
- `src/session-manager.ts`: persistent per-project automator sessions and ownership locks.
- `src/automator-backend.ts`: `miniprogram-automator` adapter.
- `src/wechatide.ts`: official DevTools control-plane adapter.
- `src/snapshot.ts` / `src/refs.ts` / `src/element-resolver.ts`: agent semantic input and target resolution.
- `src/helpers.ts` / `src/script-runner.ts`: preloaded helper API for composed JavaScript workflows.
- `skills/weapp-driver/`: installable Codex/Agent Skill.

## Commands

- `bun run build`: compile TypeScript.
- `bun run test`: build and run Node tests.
- `bun run typecheck`: type-check without emitting.
- `bun run skill:validate`: validate the bundled Skill.

## Conventions

- Keep RPC payloads JSON-serializable.
- Keep live automator objects inside the daemon.
- Retry only transient element-resolution failures; fail fast on ambiguous or invalid selectors.
- Do not bypass official `wechatide` authorization or confirmation flows.
- Add fake-backend tests for new public helpers.
