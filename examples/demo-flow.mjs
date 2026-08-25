await useProject(process.env.WEAPP_PROJECT)

await mini.reLaunch('/pages/index/index')
console.log(await page.snapshot({ includeLayout: true }))

await page.fill('loc=css:[data-testid="name"]', 'Codex')
await page.click('loc=css:[data-testid="submit"]')
await page.waitForData('submitting', false, { timeoutMs: 5_000 })

const message = await page.text('loc=css:[data-testid="message"]')
test.equal('demo greeting', message, '你好，Codex')

console.log(JSON.stringify(test.report({
  info: await mini.info(),
  errors: await logs.errors(),
  screenshot: await page.screenshot('/tmp/weapp-driver-demo.png'),
}), null, 2))
