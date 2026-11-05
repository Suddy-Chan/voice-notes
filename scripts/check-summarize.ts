import assert from "node:assert/strict"
import { summarizeLocal } from "../src/lib/summarize.ts"

const english = [
  "We need to ship the voice notes app this week.",
  "The recording button should work in Chrome, and the summary should pull out action items.",
  "Pricing is still blocked on legal review.",
  "Please email Dana before Thursday with the launch plan.",
].join(" ")

const result = summarizeLocal(english)
assert.ok(result.title.length > 0, "title")
assert.ok(result.summary.length > 0, "summary")
const combined = `${result.title} ${result.summary} ${result.points.join(" ")}`
assert.match(combined, /Thursday|email|Pricing|Chrome|voice/i)

const chinese = "今天下午要跟设计对首页。主视觉换成新的照片，轮播可以拿掉。价格页要等法务看完年度方案。周四三点开会定发布日期。"
const zh = summarizeLocal(chinese)
assert.ok(zh.title.length > 0, "zh title")
assert.ok(zh.summary.length > 0, "zh summary")

const short = summarizeLocal("Buy milk on the way home.")
assert.equal(short.points.length, 0)
assert.match(short.summary, /milk/i)

console.log("summarize ok")
console.log(JSON.stringify(result, null, 2))
