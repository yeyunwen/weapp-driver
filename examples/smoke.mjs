await useProject(process.env.MINIAPP_PROJECT)

console.log(await mini.info())
console.log(await page.snapshot({ includeLayout: true }))
console.log(await logs.errors())
