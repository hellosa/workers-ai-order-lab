# Workers AI Order Lab

一个中文售后测试页面：Clairic 提取订单事实，Clef 根据可编辑的规则建议退款、维修或人工审核。它只返回建议，不执行真实业务操作。

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

- `POST /api/test` 顺序调用 `@cf/cloudflare/clairic` 和 `@cf/cloudflare/clef`。
- 仅将 Clairic 的 `value` 传给 Clef；`null` 保持未知，不将 `guess` 当事实。
- 口令通过 Authorization 请求头发送，仅留在当前页面内存，不写浏览器存储；未配置口令时接口拒绝调用。
- 页面不保存订单或结果到数据库。输入会发送至 Cloudflare 模型；请使用虚构或脱敏数据。仓库未启用 Workers observability，也不主动记录请求内容。
- 请求体上限24,000字节；订单上限6,000字符，规则上限2,000字符。不开放跨域接口。
- 测试口令是轻量访问控制，不是按用户的限流或费用上限。分享口令会允许持有者消耗模型额度；团队使用时应增加 Cloudflare Access、限流和费用监控。
- 提示词约束不保证抵抗所有提示注入。提取和判断均可能出错，confidence 和选项概率不是正确率。禁止自动执行退款。
- 页面显示模型返回的 token 用量及服务端耗时，不确认实际计费或补贴抵扣。补贴适用范围与剩余额度以账户条款和账单为准。
- 默认示例使用固定的2026-10-20作为当前日期，便于复现实验；换订单时请同时更新文本中的日期。

## 验证

```sh
npm test
npx wrangler deploy --dry-run --outdir .wrangler/dry-run
```

单元测试覆盖鉴权、跨站请求、输入限制、未知字段传递及上游失败。它们使用模拟的 AI binding，不会产生模型费用。2026-10-20 验证：5项单元测试通过，Wrangler dry-run通过，桌面及390px手机宽度下检查了页面布局。通过现有 cf OAuth 将实际 Worker 处理函数的 AI 调用转发至目标账户，虚构示例返回实付619元、维修报价null、退款选项97.07%。随后已部署并验证线上 AI binding：静态页面HTTP 200，未带口令的API请求HTTP 401，带口令的两阶段真实推理HTTP 200，示例仍返回退款97.07%。服务端两阶段合计约974ms。运行地址与口令单独交付，不写入仓库。

## 文件

- `public/`：原生 HTML、CSS 和 JavaScript。
- `worker.js`：鉴权、输入校验及两阶段模型调用。
- `test/`：Node.js 内置测试，无生产运行时依赖。
