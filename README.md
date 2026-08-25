# miniapp-agent

`miniapp-agent` is an agent-first automation runtime for WeChat Mini Programs. It combines:

- a persistent client for the official `miniprogram-automator` WebSocket protocol for high-frequency page actions;
- official `wechatide` commands for project lifecycle, compilation, logs, preview, upload, and cloud operations;
- an ego-style JavaScript batch runner so an agent can observe, act, wait, verify, and report in one tool call;
- semantic WXML snapshots with short-lived `@N` element refs and stable locator hints.

## Architecture

```text
Codex / Claude / Cursor
        |
        v
miniapp-agent nodejs <<'EOF'
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

The daemon keeps one reusable connection per Mini Program project. CLI invocations are short-lived, but project sessions, log cursors, and snapshot refs live in the daemon. The protocol client is implemented locally with modern `ws`; it does not install the official SDK's obsolete image-decoding dependency tree.

## Requirements

- Node.js 20 or newer.
- WeChat DevTools installed and logged in.
- DevTools security settings must allow CLI/automation access.
- A valid Mini Program project with `project.config.json` and AppID.
- `wechatide` on `PATH` for control-plane helpers.

## Why this has a `package.json`

This is a JavaScript/TypeScript tool package, not an npm-service dependency. Bun also uses `package.json` for dependency resolution, scripts, the `miniapp-agent` executable, and the importable SDK entrypoint. Publishing to the npm registry is optional; local development and Codex usage work through `bun link`.

The runtime is packaged separately from the Skill because the Skill tells Codex **how and when** to test, while the package provides the executable code that actually maintains sessions and controls DevTools.

## Install and build

```bash
bun install
bun run setup
```

`bun run setup` builds the CLI, runs `bun link`, and installs the included Skill as a symlink under `~/.codex/skills/miniapp-agent`. The symlink keeps Skill edits immediately visible to Codex. Manual alternatives are:

```bash
ln -s "$(pwd)/skills/miniapp-agent" ~/.codex/skills/miniapp-agent
# or: bunx skills add ./skills/miniapp-agent
```

Installation into `~/.agents/skills` is optional and intended for other Agent clients that scan that shared directory:

```bash
bun run skill:install          # Codex only; default
bun run skill:install:agents   # shared Agent directory only
bun run skill:install:all      # both directories
```

Do not install into both roots merely for Codex: duplicate discovery can produce two entries with the same Skill name.

## First run

```bash
miniapp-agent doctor
```

With a valid project, run the built-in smoke test:

```bash
miniapp-agent smoke \
  --project /absolute/path/to/miniprogram \
  --route /pages/index/index \
  --screenshot /tmp/miniapp-smoke.png
```

It reports runtime info, a semantic page snapshot, buffered errors, a screenshot path, and an overall `ok` value.

Run a composed browser-like workflow:

```bash
miniapp-agent nodejs <<'EOF'
await useProject('/absolute/path/to/miniprogram')

await mini.reLaunch('/pages/index/index')
console.log(await page.snapshot({ includeLayout: true }))

await page.click('@1')
await page.fill('loc=css:[data-testid="reason"]', '商品信息有误')
await page.waitForData('submitting', false)

console.log({
  info: await mini.info(),
  errors: await logs.errors(),
  screenshot: await page.screenshot('/tmp/miniapp-result.png'),
})
EOF
```

Set `MINIAPP_PROJECT` to avoid repeating the project path:

```bash
export MINIAPP_PROJECT=/absolute/path/to/miniprogram
miniapp-agent nodejs <<'EOF'
console.log(await page.snapshot())
EOF
```

## Helper surface

- Sessions: `useProject`, `claimProject`, `handOffProject`, `completeProject`, `listProjectSessions`
- Recovery: `resetProject` disconnects and removes a stale project session so the next `useProject` reconnects.
- Runtime: `mini.info`, `navigate`, `goto`, `reLaunch`, `back`, `evaluate`, `callWx`, `mockWx`, `screenshot`
- Page: `snapshot`, `query`, `click`, `fill`, `text`, `data`, `setData`, `callMethod`, `waitFor*`
- Logs: `logs.read`, `logs.errors`
- Official tools: `devtools.call` plus `refresh`, `openPage`, `console`, `network`, `preview`, `upload`
- Assertions: `test.check`, `test.equal`, `test.match`, `test.report`

## Use from Codex

Start a new Codex turn after setup, then describe the feature and acceptance criteria. Explicit invocation is available when you want deterministic routing:

```text
使用 $miniapp-agent 测试 /absolute/path/to/miniprogram：
进入 /pages/order/create，选择第一个地址并提交，验证进入确认页；
不要真实支付。输出逐步 pass/fail、console 错误和截图路径。
```

Codex will inspect the page first, compose the required actions into a small number of batch executions, wait for observable state changes, and verify the result instead of treating a successful click as a successful test.

Snapshot refs are valid only for the most recent snapshot/query in that project session. Prefer emitted `loc=css:...` values when a target must survive a re-render.

## Official DevTools control plane

The generic escape hatch accepts any registered `wechatide` tool:

```js
await devtools.call('compile_wxml', {
  file: '/absolute/path/to/pages/index/index.wxml',
})

const network = await devtools.network("grep -i '/api/order'")
```

Interactive or destructive `wechatide` operations still use the official authorization and confirmation model. `miniapp-agent` does not bypass it.

Before the first `devtools` call in a task, follow the installed official `wechatide-skill` readiness/version/token gate. The batch runner intentionally does not duplicate or weaken that policy.

## Session ownership

Only one agent process may control a project session at a time. For manual user interaction:

```js
await handOffProject()
```

After the user explicitly confirms that the agent may continue:

```js
await claimProject('/absolute/path/to/miniprogram')
```

Close a persistent automator connection when a task is genuinely finished:

```js
await completeProject({ keep: false })
```

## Development

```bash
bun run test
bun run typecheck
bun run skill:validate
```

Stop the background daemon without closing WeChat DevTools:

```bash
miniapp-agent stop
```

The test suite uses an in-memory fake Mini Program backend and exercises semantic snapshots, ref expiry, ownership, persistent daemon RPC, and a complete batch script.

## Current boundaries

- Snapshot generation uses the public `miniprogram-automator` element API. Large pages may require a lower `maxElements` or a narrower selector.
- Native/custom components may expose incomplete WXML or text.
- DevTools project isolation is session/lock based; it is not equivalent to ego-lite's Chromium-level Spaces.
- Network capture from `miniprogram-automator` is not public, so network diagnostics use official `wechatide` tools.
