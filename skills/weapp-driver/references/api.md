# API reference

## Sessions

```js
await useProject(projectPath, options?)
await claimProject(projectPath, options?)
await handOffProject()
await completeProject({ keep: boolean })
await resetProject(projectPath?)
await listProjectSessions()
```

Session options mirror the official automator launcher: `wsEndpoint`, `cliPath`, `port`, `account`, `ticket`, `trustProject`, `args`, and `cwd`.

## Runtime

```js
await mini.info()
await mini.navigate(action, url?)
await mini.goto(url)
await mini.reLaunch(url)
await mini.switchTab(url)
await mini.back()
await mini.evaluate(functionOrSource, args?)
await mini.callWx(method, ...args)
await mini.mockWx(method, resultOrFunction, ...args)
await mini.restoreWx(method)
await mini.screenshot(path?)
await mini.scrollTo(scrollTop)
```

Pass a function or function declaration string to `evaluate`; closures are not captured.

## Page

```js
await page.snapshot(options?)
await page.snapshotRaw(options?)
await page.query(selector, options?)
await page.exists(selector)
await page.count(selector)
await page.click(target, waitOptions?)
await page.fill(target, value, waitOptions?)
await page.text(target, waitOptions?)
await page.value(target, waitOptions?)
await page.wxml(target, waitOptions?)
await page.attribute(target, name, waitOptions?)
await page.property(target, name, waitOptions?)
await page.style(target, name, waitOptions?)
await page.data(path?)
await page.setData(patch)
await page.callMethod(method, ...args)
await page.screenshot(path?)
await page.waitForSelector(target, waitOptions?)
await page.waitForRoute(routeOrGlob, waitOptions?)
await page.waitForData(path, expected, waitOptions?)
await page.waitForFunction(functionOrSource, args?, waitOptions?)
```

`page.snapshot()` returns formatted text. `page.snapshotRaw()` and `page.query()` return a `SnapshotResult` containing `content`, `refs`, `page`, and `capturedAt`. A zero-match query returns `refs: []`; use `page.exists()` or `page.count()` when only presence matters. Object-valued WXML attributes may appear as `[object Object]`; affected refs list their names in `opaqueAttributes`. Use `page.property()` or `component.data()` instead of parsing that string.

Snapshot options: `selector`, `includeLayout`, `maxElements`, `concurrency`.

Wait options: `timeoutMs`, `intervalMs`.

Targets: `@N`, raw CSS, `css=...`, `loc=css:...`, `text=...`, or `loc=role:button[name="..."]`.

## Custom components

```js
await component.query(parentTarget, selector, options?)
await component.property(target, name, waitOptions?)
await component.data(target, path?, waitOptions?)
await component.setData(target, patch, waitOptions?)
await component.callMethod(target, method, args?, waitOptions?)
```

`component.query()` enters the selected parent element's component boundary and returns a `SnapshotResult`. Its refs become the current snapshot refs. Custom-component data and methods require a custom element exposed by the automator protocol; native elements fail with an explicit error.

## Logs

```js
await logs.read({ since?, type? })
await logs.errors(since?)
```

Entries contain `seq`, `time`, `type`, and `payload`. Save the last sequence number to read only new entries in a later round.

## Official DevTools

```js
await devtools.call(tool, args?, options?)
await devtools.refresh()
await devtools.openPage(route, query?)
await devtools.screenshot(path?)
await devtools.console(grepCommand?)
await devtools.network(grepCommand?)
await devtools.preview()
await devtools.upload(version, description)
```

`devtools.call` automatically supplies the active project unless `args.project` is already set. Object and array arguments are written to temporary JSON files and passed using official `--<field>-file` flags.

Official tools may return an authorization task with `status: "pending"`. Surface that state to the user and wait for authorization instead of retrying the call.

## Utilities

```js
await wait(milliseconds)
help(name?)
```

## Test reporting

```js
test.check(name, condition, evidence?)
test.equal(name, actual, expected)
test.match(name, actual, substringOrRegExp)
test.report(extraEvidence?)
```

Checks do not stop the batch, so Codex can collect multiple failures and print one structured report. `test.report()` is successful only when at least one check exists and all checks pass.
