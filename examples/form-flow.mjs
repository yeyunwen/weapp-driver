await useProject(process.env.WEAPP_PROJECT)

await mini.reLaunch('/pages/form/index')
const snapshot = await page.snapshot()
console.log(snapshot)

await page.fill('loc=css:[data-testid="name"]', 'Codex')
await page.click('loc=css:#submit')
await page.waitForData('submitting', false, { timeoutMs: 10_000 })

console.log({
  page: await mini.info(),
  errors: await logs.errors(),
  screenshot: await page.screenshot('/tmp/weapp-driver-form.png'),
})
