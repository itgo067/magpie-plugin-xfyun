# opencode-xfyun-auth

An [OpenCode](https://opencode.ai) / [magpie](https://usemagpie.ai) provider plugin for
**讯飞星辰 MaaS** (iFlytek Spark), the model service at
`https://maas-api.cn-huabei-1.xf-yun.com`.

Headline model: **Spark-X2.6** — 293B-A30B MoE, 1M-token context, three reasoning
levels — plus the rest of the 星辰 model square (Spark-X2.5 family, GLM-5.2/5.3,
DeepSeek-V4-Pro/Flash, Kimi-K2.7-Code).

## Install

```sh
magpie plugin add ./opencode-xfyun-auth     # from a folder
magpie plugin login xfyun                   # paste an ak-… key
magpie provider test xfyun spark-x2.6
```

Or, once published:

```sh
magpie plugin add opencode-xfyun-auth
```

Create a key at <https://maas.xfyun.cn/apikey>. The same key works for every wire API
the gateway serves.

## Wire API

The gateway exposes three APIs on one host, and this plugin can speak any of them.
Pick one with the plugin's `options`:

```sh
magpie plugin options opencode-xfyun-auth '{"protocol":"anthropic"}'
```

| `protocol`  | npm                        | base URL                                          | endpoint              |
| ----------- | -------------------------- | ------------------------------------------------- | --------------------- |
| `chat` (default) | `@ai-sdk/openai-compatible` | `https://maas-api.cn-huabei-1.xf-yun.com/v2`        | `/chat/completions`   |
| `anthropic` | `@ai-sdk/anthropic`        | `https://maas-api.cn-huabei-1.xf-yun.com/anthropic/v1` | `/messages`           |
| `responses` | `@ai-sdk/openai`           | `https://maas-api.cn-huabei-1.xf-yun.com/v1`        | `/responses`          |

`chat` is the default because it is the API every model on the square supports and the
one the vendor documents in most depth. `anthropic` is the interesting one for Claude
Code-style agents: the gateway accepts a plain bearer `ak-…` token there and translates
Anthropic Messages bodies (including `thinking`) for the non-Claude models behind it.
`responses` only carries `spark-x2.6` and `spark-x2.6-4b`.

Reasoning variants follow the wire API: `reasoning_effort` (`low`/`medium`/`high`, or
`high`/`max` for GLM-5.2 / DeepSeek-V4) for `chat` and `responses`, `thinking.budgetTokens`
for `anthropic`.

After changing `protocol`, magpie keeps the previously resolved provider (including each
model's `npm`/`url`) until it re-resolves, so the first `magpie provider test` right after
the switch can hit the old route and report
`404 · no Route matched with those values`. Run the test again (or restart magpie) and the
new protocol is used. The endpoint itself is fine — verified per protocol:

```
chat       ✓ 894 ms · spark-x2.6     (v2/chat/completions, tool_calls + reasoning_content)
anthropic  ✓ 985 ms · spark-x2.6     (anthropic/v1/messages, thinking + tool_use)
responses  ✓ 1706 ms · spark-x2.6    (v1/responses)
```

## Models

| id                      | context | in / out / cache (¥ per M) |
| ----------------------- | ------- | -------------------------- |
| `spark-x2.6`            | 1M      | 0.9 / 3.6 / 0.08           |
| `spark-x2.6-4b`         | 1M      | free                       |
| `spark-x2.5`            | 256k    | 0.96 / 3.6 / 0.14          |
| `spark-x2.5-4b`         | 1M      | free                       |
| `spark-x2.5-1.7b`       | 1M      | free                       |
| `xopglm53` (GLM-5.3)    | 1M      | 8 / 28 / 2                 |
| `xopglm52` (GLM-5.2)    | 1M      | 8 / 28 / 2                 |
| `xopdeepseekv4pro0813`  | 1M      | 9 / 27 / 0.3               |
| `xopdeepseekv4flash0731`| 1M      | 3 / 9 / 0.1                |
| `xopkimik27code`        | 256k    | 6.5 / 27 / – (text + image) |

Prices are the model square's CNY-per-million figures converted to USD at 7.1 for the
cost display only; billing happens on the 星辰 side.

When the key can list models (`GET <base>/models`), the `provider.models` hook merges
whatever the gateway reports with this table, so new 星辰 models show up without a
plugin release. If the endpoint does not answer, the static table stands. Note that the
list endpoint only returns what the key is entitled to (for a fresh key that is just
`spark-x2.6`), which is why the table stays the primary source — the rest of the square
is listed anyway and answers `403 · the account lacks an active order` until ordered.

A model can also be pinned to a different wire API than the provider, e.g. keep the
provider on `chat` but drive `spark-x2.6` through Anthropic Messages:

```json
{
  "provider": {
    "xfyun": {
      "models": {
        "spark-x2.6": {
          "provider": {
            "npm": "@ai-sdk/anthropic",
            "api": "https://maas-api.cn-huabei-1.xf-yun.com/anthropic/v1"
          }
        }
      }
    }
  }
}
```

## Config

Everything the plugin writes into `config.provider.xfyun` is merged per field, so a
`~/.config/magpie/config.json` override of one model's name or limit keeps the rest:

```json
{
  "provider": {
    "xfyun": {
      "models": {
        "spark-x2.6": { "name": "Spark-X2.6 (fast)" }
      }
    }
  }
}
```

## Notes

- No usage/quota endpoint is known for this service (`/v1/balance`, `/v1/usage`,
  `/v1/user/info` are 404), so `magpie accounts` shows nothing for `xfyun`; spend is
  visible on the 星辰 console.
- Verified against the live gateway: tool calling works on `chat` (`finish_reason:
  tool_calls`) and on `anthropic` (`stop_reason: tool_use`), streaming works, and the
  gateway accepts `max_tokens` well beyond the documented 2048 default (up to the
  context window). `reasoning_content` is emitted by default, so a tiny `max_tokens`
  can be spent entirely on thinking and return empty `content`.
- The 星辰 Coding Plan (`maas-coding-api…`, model `astron-code-latest`) and the Token Plan
  (`maas-token-api…`) are different products on different hosts and are not covered here.
- `max_tokens` on the gateway must satisfy `prompt + max_tokens <= context - 1`.

## Test

```sh
bun test
```
