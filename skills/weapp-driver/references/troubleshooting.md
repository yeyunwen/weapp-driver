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

Use `page.wxml(target)`, component methods, page data, a screenshot, or the official debugger tools. Some native/custom components do not expose a complete public automator tree.

## Need compile/network/preview evidence

Use `devtools` helpers instead of attempting to infer these states through page automation.
