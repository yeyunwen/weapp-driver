Page({
  data: {
    name: "",
    message: "等待提交",
    submitting: false,
  },

  onInput(event) {
    this.setData({ name: event.detail.value })
  },

  onSubmit() {
    this.setData({ submitting: true })
    setTimeout(() => {
      const name = this.data.name.trim() || "访客"
      const message = `你好，${name}`
      this.setData({ message, submitting: false })
      console.info("demo submitted", { name })
    }, 200)
  },
})
