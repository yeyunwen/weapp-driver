# Troubleshooting

## `wechatide` is not found

Install or update WeChat DevTools and ensure its CLI is on `PATH`. Run `weapp doctor` again.

## Automator connection closes

Confirm DevTools is still open and the project window is valid. Run `resetProject(projectPath)`, then start a new CLI round with `useProject`. A new round also automatically replaces sessions that report a closed WebSocket.

## `SESSION_BUSY`

Another agent process is controlling the same project. Wait for that process to finish. Do not start a second daemon or switch ports automatically.

## `SESSION_USER_IN_CONTROL`

The session was handed to the user. Wait for explicit confirmation, then use `claimProject(projectPath)`.

## Missing element

Capture a fresh snapshot. Confirm the current route and refine the selector. Use a stable `id`, `data-testid`, or `data-qa` attribute where possible.

## Ambiguous element

The target matched multiple nodes and is not retryable. Add a stable attribute or use a more specific CSS selector.

## Snapshot is too large or slow

Limit the scope:

```js
await page.snapshot({ selector: '.dialog', maxElements: 80 })
```

Disable layout unless coordinates are required.

## Custom component is opaque

Start from a custom-component ref or stable selector, then enter its boundary:

```js
const nested = await component.query('@12', 'chain-store-switch')
if (nested.refs.length) {
  console.log(await component.data(nested.refs[0].ref))
}
```

Use `component.data`, `component.setData`, and `component.callMethod` for exposed custom components. Some native components still do not expose a complete public automator tree; use a screenshot or official DevTools evidence in that case.

If a snapshot ref contains `opaqueAttributes`, DevTools has already serialized those WXML values into strings such as `[object Object]`. Use `page.property(ref, name)` for the bound property or `component.data(ref)` for component state; the string itself cannot be JSON-decoded.

## DevTools asks for automation or MCP authorization again

Keep the daemon and project session alive between test rounds. On reconnect, the runtime probes the preferred Automator endpoint and reuses it when its runtime AppID matches the project metadata. The first authorization remains a DevTools security boundary and must be confirmed by the user.

## Optional element read takes five seconds

Element reads retry missing selectors for 5 seconds by default. Use `page.exists(selector)` before reading optional content, or pass `{ timeoutMs: 500 }` to the read.

## Need compile/network/preview evidence

Use `devtools` helpers instead of attempting to infer these states through page automation.

If the result has `status: "pending"`, the official tool is waiting for user authorization. Surface the request and stop; repeated calls do not bypass authorization.
