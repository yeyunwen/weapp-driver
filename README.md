# WeApp Driver

[![CI](https://github.com/yeyunwen/weapp-driver/actions/workflows/ci.yml/badge.svg)](https://github.com/yeyunwen/weapp-driver/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Fast, agent-first automation for WeChat Mini Programs. WeApp Driver gives Codex and other coding agents a persistent Mini Program session, compact semantic WXML snapshots, short-lived `@N` element refs, waits, assertions, logs, screenshots, wx API calls, and official `wechatide` controls.

## 30-second install

Prerequisites: Node.js 20+, WeChat DevTools installed and logged in, CLI/automation access enabled, and a Mini Program project with a valid AppID.

Install the runtime from npm:

```bash
npm install --global weapp-driver
```

Install the Skill for Codex:

```bash
npx --yes skills add yeyunwen/weapp-driver \
  --skill weapp-driver \
  --agent codex \
  --global \
  --yes
```

Verify the local runtime and official DevTools CLI:

```bash
weapp doctor
```

The two installs serve different purposes:

```text
weapp CLI        executes automation and keeps project sessions alive
$weapp-driver    teaches the coding agent how to observe, act, verify, and recover
```

`weapp-driver@0.1.0` is published under the npm `latest` tag. Pin `weapp-driver@0.1.0` when a reproducible installation is required.

## Use from Codex

Start a new task after installing the Skill:

```text
使用 $weapp-driver 测试 /absolute/path/to/miniprogram：
进入 /pages/order/create，选择第一个地址并提交，验证进入确认页；
不要真实支付。输出逐步 pass/fail、console 错误和截图路径。
```

The Agent will inspect the page before acting, compose dependent actions into a small number of batch executions, wait for observable state changes, and verify the result instead of treating a successful click as a successful test.

## Terminal quick start

Run a connection and page-level smoke test:

```bash
weapp smoke \
  --project /absolute/path/to/miniprogram \
  --route /pages/index/index \
  --screenshot /tmp/weapp-smoke.png
```

Run a composed workflow:

```bash
weapp nodejs <<'EOF'
await useProject('/absolute/path/to/miniprogram')
await mini.reLaunch('/pages/index/index')

console.log(await page.snapshot({ includeLayout: true }))
await page.click('@1')
await page.waitForData('loading', false, { timeoutMs: 10_000 })

test.check('no runtime errors', (await logs.errors()).length === 0)
console.log(JSON.stringify(test.report({
  info: await mini.info(),
  screenshot: await page.screenshot('/tmp/weapp-result.png'),
}), null, 2))
EOF
```

Set a default project when running several scripts:

```bash
export WEAPP_PROJECT=/absolute/path/to/miniprogram
weapp run ./examples/smoke.mjs
```

## Demo Mini Program

The repository includes a small form flow with stable QA selectors:

```text
examples/demo-miniprogram/
examples/demo-flow.mjs
```

Clone the repository, replace `touristappid` in `examples/demo-miniprogram/project.config.json` with an AppID you are allowed to use, then run:

```bash
export WEAPP_PROJECT="$PWD/examples/demo-miniprogram"
weapp run "$PWD/examples/demo-flow.mjs"
```

The demo fills a name, submits the form, waits for page data, verifies the greeting, checks runtime errors, and writes a screenshot to `/tmp/weapp-driver-demo.png`.

## Architecture

```text
Codex / Claude / Cursor
        |
        v
weapp nodejs <<'EOF'
  composed JavaScript workflow
EOF
        |
        v
persistent local daemon
  |-- automator protocol: page, element, data, wx API, screenshot
  `-- wechatide: project, compile, console/network, preview, upload, cloud
        |
        v
WeChat DevTools
```

The daemon keeps one reusable connection per Mini Program project. CLI invocations are short-lived, while project sessions, log cursors, and snapshot refs remain available for later rounds. The local socket is created with permissions restricted to the current user.

## Helper surface

- Sessions: `useProject`, `claimProject`, `handOffProject`, `completeProject`, `resetProject`, `listProjectSessions`
- Runtime: `mini.info`, `navigate`, `goto`, `reLaunch`, `switchTab`, `back`, `evaluate`, `callWx`, `mockWx`, `restoreWx`, `screenshot`, `scrollTo`
- Page: `snapshot`, `query`, `click`, `fill`, `text`, `value`, `wxml`, `attribute`, `style`, `data`, `setData`, `callMethod`, `waitFor*`
- Logs: `logs.read`, `logs.errors`
- Official tools: `devtools.call`, `refresh`, `openPage`, `console`, `network`, `preview`, `upload`
- Assertions: `test.check`, `test.equal`, `test.match`, `test.report`

Snapshot refs are valid only for the most recent snapshot or query in that project session. Prefer emitted `loc=css:...` values when a target must survive a re-render.

## Safety boundaries

Page actions can call real backend APIs. Use a dedicated test account and non-production environment.

- Treat “do not pay”, “do not submit”, and similar exclusions as hard boundaries.
- Preview, upload, publishing, and cloud mutations remain behind official `wechatide` authorization and confirmation.
- WeApp Driver does not bypass DevTools security settings or official confirmation flows.
- Do not commit AppIDs, account tickets, tokens, or production credentials in automation scripts.
- Review third-party Skills before installation; Skills run with the permissions granted to the Agent.

See [SECURITY.md](SECURITY.md) for vulnerability reporting and operational guidance.

## Compatibility

| Component | Status |
| --- | --- |
| macOS + WeChat DevTools | Verified locally with `wechatide` 0.3.9 |
| Windows + WeChat DevTools | CLI path support is implemented; real-device integration is not yet verified |
| Linux | Not currently verified; requires a working WeChat DevTools CLI on `PATH` |
| Node.js | 20 or newer |
| Bun | 1.3.14 for repository development |
| Codex Skill installation | Verified with `npx skills add ... --agent codex --global` |

Real-app compatibility still depends on the installed DevTools version, base library, native components, and the public surface exposed by the automator protocol.

## Troubleshooting

### `weapp doctor` cannot find `wechatide`

Install or update WeChat DevTools, enable CLI/automation access in its security settings, and make sure `wechatide` is available on `PATH`.

### Automator connection closes

Keep the DevTools project window open. Start a new CLI round and call `resetProject(projectPath)` before reconnecting if the session is stale.

### `SESSION_BUSY`

Another Agent process owns the same project session. Wait for it to finish; do not silently switch daemon ports.

### `SESSION_USER_IN_CONTROL`

The session was handed to the user. Continue only after explicit confirmation, then call `claimProject(projectPath)`.

### Elements are missing or ambiguous

Capture a fresh snapshot, verify the current route, and prefer stable `id`, `data-testid`, or `data-qa` attributes. Reduce `maxElements` or narrow the selector for large pages.

The bundled Skill includes more detailed setup and troubleshooting references.

## Install from source

For contributors using Bun:

```bash
git clone https://github.com/yeyunwen/weapp-driver.git
cd weapp-driver
bun install --frozen-lockfile
bun run setup
```

`bun run setup` builds the runtime, registers the local `weapp` command with `bun link`, and symlinks the bundled Skill into `~/.codex/skills/weapp-driver`.

## Development

```bash
bun run typecheck
bun run test
bun run skill:validate
bun run skill:discover
bun run release:check
```

The test suite uses an in-memory fake Mini Program backend and exercises the automator WebSocket protocol, semantic snapshots, ref expiry, assertions, project ownership, persistent daemon RPC, and a complete batch workflow.

## Current boundaries

- The real WeChat DevTools integration still needs broader AppID and DevTools-version coverage.
- Native and custom components may expose incomplete WXML or text.
- DevTools project isolation is session/lock based; it is not equivalent to Chromium-level process isolation.
- Network capture is not public in `miniprogram-automator`, so network diagnostics use official `wechatide` tools.
- WeApp Driver is an agent-oriented interaction and debugging layer, not a replacement for component unit tests or a full CI regression framework.

## License

MIT
