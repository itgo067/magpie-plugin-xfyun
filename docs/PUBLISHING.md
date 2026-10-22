# 发布手册 / Publishing playbook

这套流程在 `opencode-xfyun-auth@0.1.0` 上完整跑通过一次（2026-10-22），下面每一步都是实测有效的。
以后发新版本，从「每次发版」一节开始照做即可。

---

## 0. 一次性准备（只做一次，已完成可跳过）

### 0.1 npm 账号

- 注册：https://www.npmjs.com/signup ，**必须验证邮箱**，否则 publish 会被拒。
- 确认邮箱已验证：

  ```bash
  npm profile get --registry=https://registry.npmjs.org --json | grep email_verified
  # → "email_verified": true
  ```

### 0.2 强制 2FA（npm 现在发布必须满足）

npm 规定：**发布包必须「账号开了 2FA」或「用勾了 Bypass 2FA 的 granular token」**，二选一。

推荐做法 —— 网页开 2FA（安全密钥 / Windows Hello，Edge 也支持）：

1. 打开 https://www.npmjs.com/settings/~/profile → Two-Factor Authentication
2. 选 **Security Key**（WebAuthn），按浏览器提示注册（Windows Hello 指纹/PIN 即可）
3. 保存 **recovery codes**（丢了只能靠它）

确认状态：

```bash
npm profile get --registry=https://registry.npmjs.org --json
# → "tfa": { "mode": "auth-and-writes" }
```

> ⚠️ 坑：网页 2FA 页面**只给 Security Key 选项**，没有 authenticator app。TOTP 现在只能在 CLI 里配，而 npm 已弃用 CLI 的 TOTP 注册（`npm profile enable-2fa` 现在会直接返回「already enabled」或 404）。所以走 Security Key 这条路就行，不用找 TOTP。

### 0.3 registry 不能被镜像劫持

`~/.npmrc` 如果只有 `registry=https://registry.npmmirror.com`（淘宝镜像），**publish 一定失败**，因为镜像是只读的。

两种解法，任选：

- **方案 A（推荐）**：`package.json` 里写死 `publishConfig`，publish 时自动覆盖 registry，日常 install 仍走镜像：

  ```json
  "publishConfig": { "access": "public", "registry": "https://registry.npmjs.org/" }
  ```

- **方案 B**：命令里显式指定 `--registry=https://registry.npmjs.org`。

### 0.4 登录 npm

```bash
npm login --auth-type=web --registry=https://registry.npmjs.org
npm whoami --registry=https://registry.npmjs.org   # → itgo067
```

登录凭证会写进 `~/.npmrc` 的 `//registry.npmjs.org/:_authToken=...`。

### 0.5 GitHub

```bash
ssh -T git@github.com          # → Hi <user>! You've successfully authenticated
git config user.name  <你的 GitHub 用户名>
git config user.email <用户名>@users.noreply.github.com
```

> ⚠️ 坑：`git tag -a`（带注释的 tag）需要 committer 身份，没配 `user.name`/`user.email` 会报
> `Committer identity unknown ... fatal: unable to auto-detect email address`。
> 轻量 tag（`git tag v1.0.0` 不带 `-a`）不需要，但建议还是把身份配上。

---

## 1. 每次发版（照抄这 6 步）

以发布 `0.1.1` 为例。

### 1.1 改版本号

```bash
cd /home/mint/works/magpie-plugin-xfyun
npm version patch        # 或 minor / major；会改 package.json 并自动 commit + 打 tag
```

### 1.2 跑测试 + 干跑打包（看清单对不对）

```bash
bun test                 # 期望 12 pass, 0 fail
npm pack --dry-run       # 看 Tarball Contents，确认没把 *.test.mjs / .github 打进去
```

`files` 字段决定了打进去什么。当前是 `["index.mjs","README.md","LICENSE"]`，`package.json` 自动包含。

### 1.3 发布

```bash
npm publish --access public
```

**会弹 2FA 挑战**，两种形态：

- **终端里直接可交互**：npm 打印
  ```
  Authenticate your account at: https://www.npmjs.com/auth/cli/<uuid>
  ```
  在浏览器打开 → 点确认（安全密钥/Windows Hello）→ 终端自动继续发布。

- **终端不可交互**（脚本、CI、AI agent 里跑）：命令会卡住或被打断。这时用后台 + 假 TTY 跑，把链接取出来点：
  ```bash
  (sleep 240 | script -qfc "npm publish --access public" /tmp/pub.log >/dev/null 2>&1 &)
  sleep 15
  tr '\r' '\n' < /tmp/pub.log | grep -oE "https://www\.npmjs\.com/auth/cli/[a-f0-9-]+"
  ```
  拿到链接在浏览器点确认后，发布会在后台完成，用 1.4 验证。

### 1.4 验证真的上去了

```bash
# 官方 registry 视角（最权威）
npm view <包名> version dist-tags --registry=https://registry.npmjs.org

# 直接问 registry
curl -s https://registry.npmjs.org/<包名> | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['dist-tags'], list(d['versions']))"

# 下载 tarball 看内容
curl -sO https://registry.npmjs.org/<包名>/-/<包名>-<版本>.tgz && tar tzf <包名>-<版本>.tgz
```

### 1.5 推 GitHub

```bash
git push origin main --tags
```

`npm version` 已经打好 tag，一起推上去。然后在 GitHub 上把 tag 转成 Release（可选，网页操作）。

### 1.6 端到端安装验证（最关键的一步）

别只看 registry 元数据，**要真的装一遍**：

```bash
sb=$(mktemp -d)
m() { env HOME=$sb XDG_CONFIG_HOME=$sb/.config XDG_CACHE_HOME=$sb/.cache \
      MAGPIE_ADDR=127.0.0.1:3496 MAGPIE_BUN=/home/mint/.bun/bin/bun magpie "$@"; }

m plugin add <包名>                       # ✓ added <包名>@latest
printf 'ak-xxxx\n' | m plugin login xfyun  # ✓ signed in to ...
m provider test xfyun spark-x2.6          # ✓ chat  1234 ms · spark-x2.6
m provider models xfyun                   # ✓ 10 models from xfyun
rm -rf "$sb"
```

> ⚠️ 坑：sandbox 里必须设 `MAGPIE_BUN=/home/mint/.bun/bin/bun`。
> 否则 magpie 会尝试往空的 `XDG_CACHE_HOME` 下载自己的 bun，命令**卡满 60 秒**然后返回 `{"loaded":null}`。

---

## 2. 排错手册

### `E403 ... Two-factor authentication or granular access token with bypass 2fa enabled is required`

这是**最常踩的坑**，两个不同原因都会报这一句：

| 原因 | 判断方法 | 解法 |
|---|---|---|
| `~/.npmrc` 里的 token 是**开 2FA 之前**签发的（token 的 tfa 绑定在创建时写死，账户后来开 2FA 也不会更新它） | `npm whoami` 正常，但 publish 直接 403，**没有** `EOTP` / 不弹浏览器 | `npm login --auth-type=web` 重新登录拿新 token |
| 用的是 granular token，但创建时**没勾 Bypass 2FA** | `npm token list --json` 里 `"bypass_2fa": false` | 去 https://www.npmjs.com/settings/~/tokens 重新生成，**勾上 Bypass two-factor authentication** |

**关键区分**：真的需要 2FA 挑战时，registry 返回的是 `EOTP` 且 body 带 `authUrl`/`doneUrl`，npm 会弹浏览器链接。
如果拿到的是**普通 403 且没有任何链接**，说明 token 本身不被认可 —— 重新登录，别去折腾浏览器。

### 浏览器 / Edge 相关

跟浏览器无关。Edge 支持 WebAuthn，npm 的网页 2FA 在 Edge 里正常。看到 403 时不要怀疑浏览器，先按上表查 token。

### `EOTP` 但没弹出链接

npm 只在 `process.stdin.isTTY && process.stdout.isTTY` 时才走 web 认证流程（见 npm 源码 `lib/utils/auth.js` 的 `otplease`）。
在非交互环境里跑就会直接抛错。用 1.3 里的 `script -qfc` 假 TTY 方案。

### 发布后 registry 里多了一个 `0.0.0-stage`

npm 对**首次发布的新包名**会自动创建一个占位版本（stub），`dist-tags` 随后指向你真正的版本。
不影响使用，想清掉：

```bash
npm unpublish <包名>@0.0.0-stage --registry=https://registry.npmjs.org
```

### `magpie plugin add` 装不到 / 装了但 provider 不出现

- 装的是 npm 包还是本地路径，会影响 `magpie plugin options` 用的名字：
  - npm / git 安装 → 用 **npm 包名**（`opencode-xfyun-auth`）
  - 本地路径安装 → 用**目录名**（`magpie-plugin-xfyun`）
- 用 `magpie plugin list` 看括号里的名字，那就是 `plugin options` 要用的。

### 改了 plugin options（比如 `protocol`）后 `provider test` 报 404 `no Route matched with those values`

**不是插件 bug**。magpie 的 `plugin-providers.json` 是懒刷新的：切换 options 后**第一次** test 仍用旧的 `npm`/`url`，**再跑一次**就对了。
在 README 里也记了这条。

---

## 3. 包命名约定

magpie 社区约定：`@magpie-community/opencode-<vendor>-auth`。
个人发布去掉 scope 就是 `opencode-<vendor>-auth` —— 本包是 `opencode-xfyun-auth`。

npm 搜索依赖关键词，`package.json` 里要包含：

```json
"keywords": ["opencode", "opencode-plugin", "<vendor>"]
```

npm 的搜索会匹配 name 或 keywords 里含 `opencode` **且**含 auth/plugin/provider 之一的包，
magpie GUI 的插件搜索就是基于这个，所以**不需要往 magpie-community 提 PR 也能被搜到**。

---

## 4. 快速参考

```bash
# 一次性
npm login --auth-type=web --registry=https://registry.npmjs.org
npm profile get --registry=https://registry.npmjs.org --json   # 确认 tfa / email_verified

# 每次发版
npm version patch && bun test && npm pack --dry-run
npm publish --access public
npm view <包名> version --registry=https://registry.npmjs.org
git push origin main --tags

# 端到端验证（必须）
sb=$(mktemp -d); m() { env HOME=$sb XDG_CONFIG_HOME=$sb/.config XDG_CACHE_HOME=$sb/.cache \
  MAGPIE_ADDR=127.0.0.1:3496 MAGPIE_BUN=/home/mint/.bun/bin/bun magpie "$@"; }
m plugin add <包名>; m plugin login xfyun; m provider test xfyun spark-x2.6; rm -rf "$sb"
```
