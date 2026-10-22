import { expect, test } from "bun:test"
import { _internal, XfyunAuthPlugin } from "./index.mjs"

const { PROTOCOL, MODELS, model, entry, variants, pickProtocol, modelIds, usd } = _internal

test("protocol defaults to chat", () => {
  expect(pickProtocol(undefined)).toBe("chat")
  expect(pickProtocol("Anthropic")).toBe("anthropic")
  expect(pickProtocol("responses")).toBe("responses")
  expect(pickProtocol("nope")).toBe("chat")
})

test("each protocol points at the gateway", () => {
  expect(PROTOCOL.chat.base).toBe("https://maas-api.cn-huabei-1.xf-yun.com/v2")
  expect(PROTOCOL.anthropic.base).toBe("https://maas-api.cn-huabei-1.xf-yun.com/anthropic/v1")
  expect(PROTOCOL.responses.base).toBe("https://maas-api.cn-huabei-1.xf-yun.com/v1")
  expect(PROTOCOL.chat.npm).toBe("@ai-sdk/openai-compatible")
  expect(PROTOCOL.anthropic.npm).toBe("@ai-sdk/anthropic")
  expect(PROTOCOL.responses.npm).toBe("@ai-sdk/openai")
})

test("spark-x2.6 is declared with a 1M context", () => {
  const m = MODELS.find((x) => x.id === "spark-x2.6")
  expect(m.context).toBe(1_000_000)
  const e = entry(m, "chat")
  expect(e.limit).toEqual({ context: 1_000_000, output: m.output })
  expect(e.tool_call).toBe(true)
  expect(e.modalities.input).toEqual(["text"])
})

test("variants follow the wire api", () => {
  const m = MODELS.find((x) => x.id === "spark-x2.6")
  expect(variants(m, "chat")).toEqual({
    low: { reasoningEffort: "low" },
    medium: { reasoningEffort: "medium" },
    high: { reasoningEffort: "high" },
  })
  expect(variants(m, "anthropic").high).toEqual({
    thinking: { type: "enabled", budgetTokens: 16_000 },
  })
})

test("model() is an OpenCode model", () => {
  const m = MODELS.find((x) => x.id === "spark-x2.6")
  const out = model(m, "anthropic")
  expect(out.id).toBe("spark-x2.6")
  expect(out.providerID).toBe("xfyun")
  expect(out.api).toEqual({
    id: "spark-x2.6",
    url: "https://maas-api.cn-huabei-1.xf-yun.com/anthropic/v1",
    npm: "@ai-sdk/anthropic",
  })
  expect(out.capabilities.toolcall).toBe(true)
  expect(out.limit.context).toBe(1_000_000)
  expect(out.cost.input).toBeGreaterThan(0)
  expect(out.cost.cache.read).toBeGreaterThan(0)
})

test("free models are marked free", () => {
  const m = MODELS.find((x) => x.id === "spark-x2.6-4b")
  expect(model(m, "chat").free).toBe(true)
  expect(model(MODELS.find((x) => x.id === "spark-x2.6"), "chat").free).toBeUndefined()
})

test("cny is converted to usd per million tokens", () => {
  expect(usd(7.1)).toBe(1)
  expect(usd(3.6)).toBeCloseTo(0.507, 3)
})

test("model list parsing accepts the three shapes", () => {
  expect(modelIds({ data: [{ id: "a" }, { id: "b" }] })).toEqual(["a", "b"])
  expect(modelIds({ models: ["c"] })).toEqual(["c"])
  expect(modelIds(["d"])).toEqual(["d"])
  expect(modelIds({})).toEqual([])
  expect(modelIds(undefined)).toEqual([])
})

test("config hook fills in the provider without clobbering user config", async () => {
  const plugin = await XfyunAuthPlugin({}, { protocol: "anthropic" })
  const cfg = { provider: { xfyun: { name: "mine", models: { "spark-x2.6": { name: "custom" } } } } }
  await plugin.config(cfg)
  const p = cfg.provider.xfyun
  expect(p.name).toBe("mine")
  expect(p.npm).toBe("@ai-sdk/anthropic")
  expect(p.api).toBe("https://maas-api.cn-huabei-1.xf-yun.com/anthropic/v1")
  expect(p.models["spark-x2.6"].name).toBe("custom")
  expect(p.models["spark-x2.5"]).toBeDefined()
  expect(p.models["spark-x2.6"].variants.high.thinking.type).toBe("enabled")
})

test("config hook creates the provider from scratch", async () => {
  const plugin = await XfyunAuthPlugin({}, undefined)
  const cfg = {}
  await plugin.config(cfg)
  expect(cfg.provider.xfyun.name).toContain("Spark")
  expect(cfg.provider.xfyun.models["spark-x2.6"].tool_call).toBe(true)
  expect(cfg.provider.xfyun.models["spark-x2.6"].variants.low.reasoningEffort).toBe("low")
})

test("models hook falls back to the static table without auth", async () => {
  const plugin = await XfyunAuthPlugin({}, { protocol: "chat" })
  const provider = { models: { "spark-x2.6": entry(MODELS[0], "chat") } }
  expect(await plugin.provider.models(provider, {})).toBe(provider.models)
  expect(await plugin.provider.models(provider, { auth: { type: "api", key: "" } })).toBe(
    provider.models,
  )
})

test("loader signs requests with both bearer and x-api-key", async () => {
  const plugin = await XfyunAuthPlugin({}, { protocol: "chat" })
  const got = await plugin.auth.loader(async () => ({ type: "api", key: "ak-test" }))
  expect(got.baseURL).toBe("https://maas-api.cn-huabei-1.xf-yun.com/v2")
  expect(got.apiKey).toBe("ak-test")
  expect(await plugin.auth.loader(async () => ({ type: "oauth" }))).toEqual({})
})
