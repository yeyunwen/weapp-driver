# Setup

## Public installation

Install the runtime from npm:

```bash
npm install --global weapp-driver
```

Install the Skill for Codex with the Skills CLI:

```bash
npx --yes skills add yeyunwen/weapp-driver \
  --skill weapp-driver \
  --agent codex \
  --global \
  --yes
```

The runtime and Skill are separate: `weapp` executes automation, while `$weapp-driver` tells the agent how to use it safely.

Verify:

```bash
weapp doctor
```

## Repository development

From the `weapp-driver` repository, run the idempotent local setup:

```bash
bun install
bun run setup
```

This builds the runtime, registers the `weapp` CLI with Bun, and symlinks the bundled Skill into `${CODEX_HOME:-~/.codex}/skills/weapp-driver`.

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

## Manual Skill installation

Only use this when the setup script cannot be used:

```bash
ln -s /absolute/path/to/weapp-driver/skills/weapp-driver ~/.codex/skills/weapp-driver
```

or:

```bash
bunx skills add /absolute/path/to/weapp-driver/skills/weapp-driver
```

## WeChat DevTools

Require:

- DevTools installed and logged in.
- CLI/automation access enabled in security settings.
- `wechatide` available on `PATH` for control-plane operations.
- A project containing valid `project.config.json` and AppID.

Use `WEAPP_PROJECT` for a default project and `WEAPP_DRIVER_SOCKET` to override the daemon socket.

## Connection modes

Default launch mode lets `miniprogram-automator` start/connect DevTools from `projectPath`.

The runtime keeps project sessions in its daemon. If the preferred Automator port is already open, it probes the endpoint and reuses it only when the runtime AppID matches `ext.json` or `project.config.json`. This avoids repeating the DevTools authorization flow after a daemon restart while preventing accidental attachment to another app.

Connect to an existing automation WebSocket when available:

```js
await useProject('/absolute/project', {
  wsEndpoint: 'ws://127.0.0.1:9420',
})
```

Use `cliPath`, `port`, `account`, `ticket`, and `trustProject` only when the default launch mode needs them.
