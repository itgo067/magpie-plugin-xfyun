// magpie / OpenCode provider plugin: 讯飞星辰 MaaS (iFlytek Spark)
// Exposes the models of https://maas.xfyun.cn model square through the
// inference gateway https://maas-api.cn-huabei-1.xf-yun.com.
//
// The gateway speaks three wire APIs, all served from the same host:
//   chat completions  POST /v2/chat/completions
//   Responses         POST /v1/responses
//   Anthropic         POST /anthropic/v1/messages
// Pick one with the plugin option `protocol` ("chat" | "anthropic" | "responses").

const PROVIDER = "xfyun"
const ORIGIN = "https://maas-api.cn-huabei-1.xf-yun.com"

// Gateway prices are quoted in CNY per million tokens; magpie wants USD.
const CNY_PER_USD = 7.1

// base = what the SDK appends its own path to:
//   @ai-sdk/anthropic          -> `${base}/messages`
//   @ai-sdk/openai-compatible  -> `${base}/chat/completions`
//   @ai-sdk/openai             -> `${base}/responses`
const PROTOCOL = {
  chat: {
    npm: "@ai-sdk/openai-compatible",
    base: `${ORIGIN}/v2`,
    list: `${ORIGIN}/v2/models`,
  },
  anthropic: {
    npm: "@ai-sdk/anthropic",
    base: `${ORIGIN}/anthropic/v1`,
    list: `${ORIGIN}/anthropic/v1/models`,
  },
  responses: {
    npm: "@ai-sdk/openai",
    base: `${ORIGIN}/v1`,
    list: `${ORIGIN}/v1/models`,
  },
}

const EFFORTS = ["low", "medium", "high"]
const BUDGET = { minimal: 1024, low: 4096, medium: 8192, high: 16_000, max: 31_999 }

// `cny` = [input, output, cache read] per million tokens, from the model square.
// `endpoints` = which wire APIs the model is published on.
const MODELS = [
  {
    id: "spark-x2.6",
    name: "Spark-X2.6",
    context: 1_000_000,
    output: 65_536,
    efforts: EFFORTS,
    cny: [0.9, 3.6, 0.08],
    endpoints: ["chat", "anthropic", "responses"],
  },
  {
    id: "spark-x2.6-4b",
    name: "Spark-X2.6-4B",
    context: 1_000_000,
    output: 32_768,
    efforts: EFFORTS,
    cny: [0, 0, 0],
    endpoints: ["chat", "anthropic", "responses"],
  },
  {
    id: "spark-x2.5",
    name: "Spark-X2.5",
    context: 256_000,
    output: 32_768,
    efforts: EFFORTS,
    cny: [0.96, 3.6, 0.14],
    endpoints: ["chat", "anthropic"],
  },
  {
    id: "spark-x2.5-4b",
    name: "Spark-X2.5-4B",
    context: 1_000_000,
    output: 32_768,
    efforts: EFFORTS,
    cny: [0, 0, 0],
    endpoints: ["chat", "anthropic"],
  },
  {
    id: "spark-x2.5-1.7b",
    name: "Spark-X2.5-1.7B",
    context: 1_000_000,
    output: 32_768,
    efforts: [],
    cny: [0, 0, 0],
    endpoints: ["chat", "anthropic"],
  },
  {
    id: "xopglm53",
    name: "GLM-5.3",
    context: 1_000_000,
    output: 65_536,
    efforts: ["high", "max"],
    cny: [8, 28, 2],
    endpoints: ["chat", "anthropic"],
  },
  {
    id: "xopglm52",
    name: "GLM-5.2",
    context: 1_000_000,
    output: 65_536,
    efforts: ["high", "max"],
    cny: [8, 28, 2],
    endpoints: ["chat", "anthropic"],
  },
  {
    id: "xopdeepseekv4pro0813",
    name: "DeepSeek-V4-Pro-0813",
    context: 1_000_000,
    output: 65_536,
    efforts: ["high", "max"],
    cny: [9, 27, 0.3],
    endpoints: ["chat", "anthropic"],
  },
  {
    id: "xopdeepseekv4flash0731",
    name: "DeepSeek-V4-Flash-0731",
    context: 1_000_000,
    output: 65_536,
    efforts: ["high", "max"],
    cny: [3, 9, 0.1],
    endpoints: ["chat", "anthropic"],
  },
  {
    id: "xopkimik27code",
    name: "Kimi-K2.7-Code",
    context: 256_000,
    output: 32_768,
    efforts: EFFORTS,
    cny: [6.5, 27, 0],
    image: true,
    endpoints: ["chat", "anthropic"],
  },
]

const usd = (cny) => Math.round((cny / CNY_PER_USD) * 10_000) / 10_000

function pickProtocol(value) {
  const name = typeof value === "string" ? value.trim().toLowerCase() : ""
  return Object.hasOwn(PROTOCOL, name) ? name : "chat"
}

function forProtocol(protocol) {
  return MODELS.filter((m) => m.endpoints.includes(protocol))
}

function variants(m, protocol) {
  if (!m.efforts?.length) return undefined
  return Object.fromEntries(
    m.efforts.map((effort) =>
      protocol === "anthropic"
        ? // @ai-sdk/anthropic provider option
          [effort, { thinking: { type: "enabled", budgetTokens: BUDGET[effort] ?? 8192 } }]
        : // @ai-sdk/openai-compatible / @ai-sdk/openai provider option
          [effort, { reasoningEffort: effort }],
    ),
  )
}

function cost(m) {
  return {
    input: usd(m.cny[0] ?? 0),
    output: usd(m.cny[1] ?? 0),
    cache_read: usd(m.cny[2] ?? 0),
    cache_write: 0,
  }
}

// Shape of a model inside the `config` hook (what OpenCode's config expects).
function entry(m, protocol) {
  const c = cost(m)
  const e = {
    name: m.name,
    limit: { context: m.context, output: m.output },
    reasoning: Boolean(m.efforts?.length),
    tool_call: true,
    attachment: Boolean(m.image),
    modalities: { input: m.image ? ["text", "image"] : ["text"], output: ["text"] },
    cost: c,
  }
  const v = variants(m, protocol)
  if (v) e.variants = v
  return e
}

function configModels(protocol) {
  return Object.fromEntries(forProtocol(protocol).map((m) => [m.id, entry(m, protocol)]))
}

// Per-field merge so a user overriding `name` keeps our limit/variants/cost.
function mergeModels(defaults, user) {
  const out = { ...defaults }
  for (const [id, value] of Object.entries(user ?? {})) {
    out[id] = out[id] ? { ...out[id], ...value } : value
  }
  return out
}

// Shape of a model returned by the `provider.models` hook (OpenCode Model).
function model(m, protocol) {
  const e = entry(m, protocol)
  const p = PROTOCOL[protocol]
  const out = {
    id: m.id,
    providerID: PROVIDER,
    name: m.name,
    api: { id: m.id, url: p.base, npm: p.npm },
    status: "active",
    cost: { input: e.cost.input, output: e.cost.output, cache: { read: e.cost.cache_read, write: 0 } },
    limit: { context: e.limit.context, output: e.limit.output },
    options: {},
    headers: {},
    capabilities: {
      temperature: true,
      reasoning: e.reasoning,
      attachment: e.attachment,
      toolcall: true,
      input: { text: true, image: Boolean(m.image), audio: false, video: false, pdf: false },
      output: { text: true, image: false, audio: false, video: false, pdf: false },
      interleaved: false,
    },
    release_date: "",
    variants: e.variants ?? {},
  }
  if (!m.cny[0] && !m.cny[1]) out.free = true
  return out
}

function authHeaders(key) {
  const headers = { authorization: `Bearer ${key}` }
  // Claude Code sends the token as a bearer; the Anthropic SDK would use
  // x-api-key, so send both and let the gateway pick.
  headers["x-api-key"] = key
  return headers
}

// `{ data: [{ id }] }` (OpenAI), `{ models: [...] }`, or a bare array.
function modelIds(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : (payload?.data ?? payload?.models ?? payload?.result ?? [])
  const list = Array.isArray(rows) ? rows : []
  return list
    .map((row) => (typeof row === "string" ? row : (row?.id ?? row?.model ?? row?.serviceId)))
    .filter((id) => typeof id === "string" && id.length > 0)
}

async function listModelIds(key, protocol) {
  const res = await fetch(PROTOCOL[protocol].list, {
    headers: { ...authHeaders(key), accept: "application/json" },
  })
  if (!res.ok) return undefined
  return modelIds(await res.json())
}

export const XfyunAuthPlugin = async (input, options) => {
  const protocol = pickProtocol(options?.protocol)
  const p = PROTOCOL[protocol]
  const known = forProtocol(protocol)

  return {
    config: async (cfg) => {
      cfg.provider ??= {}
      const was = cfg.provider[PROVIDER] ?? {}
      cfg.provider[PROVIDER] = {
        name: "iFlytek Spark (讯飞星辰)",
        npm: p.npm,
        api: p.base,
        ...was,
        models: mergeModels(configModels(protocol), was.models),
      }
    },

    auth: {
      provider: PROVIDER,
      methods: [
        {
          type: "api",
          label: "讯飞星辰 API key",
          placeholder: "ak-…",
        },
      ],

      async loader(getAuth) {
        const auth = await getAuth()
        if (auth?.type !== "api" || !auth.key) return {}
        const key = auth.key
        return {
          baseURL: p.base,
          apiKey: key,
          async fetch(request, init) {
            const headers = new Headers(init?.headers ?? {})
            headers.set("authorization", `Bearer ${key}`)
            headers.set("x-api-key", key)
            return fetch(request, { ...init, headers })
          },
        }
      },
    },

    provider: {
      id: PROVIDER,
      // Ask the gateway which models this key may use; fall back to the
      // static square table when it does not answer.
      async models(provider, { auth } = {}) {
        if (auth?.type !== "api" || !auth.key) return provider.models
        let ids
        try {
          ids = await listModelIds(auth.key, protocol)
        } catch {
          return provider.models
        }
        if (!ids?.length) return provider.models

        const listed = new Set(ids)
        const out = {}
        // Known models stay listed even if the endpoint is paginated, unless
        // the key demonstrably does not see any model at all.
        for (const m of known) out[m.id] = model(m, protocol)
        for (const id of listed) {
          if (out[id]) continue
          out[id] = model(
            {
              id,
              name: id,
              context: 1_000_000,
              output: 32_768,
              efforts: [],
              cny: [0, 0, 0],
              endpoints: [protocol],
            },
            protocol,
          )
        }
        return out
      },
    },
  }
}

// Not a function, so magpie does not try to load it as a plugin; `bun test` uses it.
export const _internal = {
  PROVIDER,
  ORIGIN,
  PROTOCOL,
  MODELS,
  usd,
  pickProtocol,
  forProtocol,
  variants,
  entry,
  model,
  modelIds,
  listModelIds,
  authHeaders,
}
