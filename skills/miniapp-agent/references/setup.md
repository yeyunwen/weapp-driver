# Setup

## Install the runtime

From the `miniapp-agent` repository, run the idempotent local setup:

```bash
bun install
bun run setup
```

This builds the runtime, registers the `miniapp-agent` CLI with Bun, and symlinks the bundled Skill into `${CODEX_HOME:-~/.codex}/skills/miniapp-agent`.

Codex only needs the `~/.codex/skills` installation. If another Agent client scans the shared `~/.agents/skills` convention, install that target explicitly:

```bash
bun run skill:install:agents
```

Available installation scripts:

```bash
bun run skill:install          # ~/.codex/skills only
bun run skill:install:agents   # ~/.agents/skills only
bun run skill:install:all      # both, only when both clients need it
```

Avoid `all` when the same client scans both roots, because duplicate Skill names may be displayed twice. The installer never overwrites an existing directory or a symlink pointing elsewhere.

Verify:

```bash
miniapp-agent doctor
```

## Manual Skill installation

Only use this when the setup script cannot be used:

```bash
ln -s /absolute/path/to/miniapp-agent/skills/miniapp-agent ~/.codex/skills/miniapp-agent
```

or:

```bash
bunx skills add /absolute/path/to/miniapp-agent/skills/miniapp-agent
```

## WeChat DevTools

Require:

- DevTools installed and logged in.
- CLI/automation access enabled in security settings.
- `wechatide` available on `PATH` for control-plane operations.
- A project containing valid `project.config.json` and AppID.

Use `MINIAPP_PROJECT` for a default project and `MINIAPP_AGENT_SOCKET` to override the daemon socket.

## Connection modes

Default launch mode lets `miniprogram-automator` start/connect DevTools from `projectPath`.

Connect to an existing automation WebSocket when available:

```js
await useProject('/absolute/project', {
  wsEndpoint: 'ws://127.0.0.1:9420',
})
```

Use `cliPath`, `port`, `account`, `ticket`, and `trustProject` only when the default launch mode needs them.
