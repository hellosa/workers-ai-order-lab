# Workers AI Order Lab

一个中文售后测试页面：Clairic 提取一次订单事实，Clef 与 Jev 按相同规则、事实和选项并行建议退款、维修或人工审核。它只返回建议，不执行真实业务操作。

## 本地运行

需要 Node.js 22+ 和有 Workers AI 权限的 Cloudflare 账号。

```sh
npm ci
npx wrangler login
```

在本地创建 `.dev.vars`（已被 Git 忽略）：

```dotenv
LAB_PASSWORD=replace-with-a-long-random-password
```

```sh
CLOUDFLARE_ACCOUNT_ID=<your-account-id> npm run dev
```

打开终端输出的本地地址。Workers AI 在本地开发中也会使用远端推理并产生用量；页面中的口令必须与 `.dev.vars` 一致。不要提交这个文件。

## 部署到自己的 Cloudflare 账户

本仓库不包含账户 ID、API Token 或测试口令。选择目标账号，先设置运行时 Secret，再部署：

```sh
CLOUDFLARE_ACCOUNT_ID=<your-account-id> npx wrangler secret put LAB_PASSWORD
CLOUDFLARE_ACCOUNT_ID=<your-account-id> npm run deploy
```

Wrangler 会交互式接收 Secret。使用 CLI 输出的 URL 访问页面。AI binding 由 `wrangler.jsonc` 的 `ai.binding` 提供，浏览器不接触 Cloudflare 凭据。

## 行为与边界

- `POST /api/test` 先调用一次 `@cf/cloudflare/clairic`，随后并行调用 `@cf/cloudflare/clef` 和 `typesafe/jev`。
- 仅将 Clairic 的 `value` 传给两个决策模型；`null` 保持未知，不将 `guess` 当事实。
- 口令通过 Authorization 请求头发送，仅留在当前页面内存，不写浏览器存储；未配置口令时接口拒绝调用。
- 页面不保存订单或结果到数据库。输入会通过 Cloudflare 发送至相应模型提供方（Jev 为 TypeSafe 第三方模型）；请使用虚构或脱敏数据。仓库未启用 Workers observability，也不主动记录请求内容。
- 请求体上限24,000字节；订单上限6,000字符，规则上限2,000字符。不开放跨域接口。
- 测试口令是轻量访问控制，不是按用户的限流或费用上限。分享口令会允许持有者消耗模型额度；团队使用时应增加 Cloudflare Access、限流和费用监控。
- 提示词约束不保证抵抗所有提示注入。提取和判断均可能出错，confidence 和选项概率不是正确率。禁止自动执行退款。
- 页面分别显示两模型结果、选项概率、实际返回的输入/输出 token 和每次调用耗时。Clairic 用量单列为共享成本。并行耗时不应相加，各模型分词方式可能不同，单次耗时不是性能基准。
- 单模型失败时保留另一个结果。失败请求耗时不表示成功推理耗时，缺失 token 显示“未返回”，不猜为0。
- Jev 需要可用的第三方模型计费来源。当前目标账户直接调用返回402 / 2021（Insufficient balance; add money to your gateway or use BYOK），AI binding调用也失败。Jev真实决策与用量对比保持pending。未充值，未配置BYOK；不要假设Startup补贴可以直接抵扣第三方模型。
- 页面不确认实际计费或补贴抵扣。补贴适用范围与剩余额度以账户条款和账单为准。
- 默认示例使用固定的2026-10-20作为当前日期，便于复现实验；换订单时请同时更新文本中的日期。

## 验证

```sh
npm test
npx wrangler deploy --dry-run --outdir .wrangler/dry-run
```

2026-10-20：8项单元测试通过，覆盖鉴权、输入限制、同输入并行对比、未知字段保留、单模型失败及计费错误脱敏；Wrangler dry-run通过。线上已验证未带口令返回401、页面与接口可访问，Clairic及Clef成功，Jev调用失败。浏览器已验证真实部分成功状态与token展示。Jev真实双模型结果对比仍待解决第三方计费来源。运行地址与口令单独交付，不写入仓库。

## 文件

- `public/`：原生 HTML、CSS 和 JavaScript。
- `worker.js`：鉴权、输入校验、共享提取及双模型并行调用。
- `test/`：Node.js 内置测试，无生产运行时依赖。
