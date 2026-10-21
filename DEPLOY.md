# 部署说明

## ✅ 已上线（2026-10-21）

**永久地址：https://frankshare.github.io/git-user-analysis-web/**

| 项 | 值 |
| --- | --- |
| 公网地址 | https://frankshare.github.io/git-user-analysis-web/ （永久） |
| 仓库 | https://github.com/frankshare/git-user-analysis-web |
| 部署方式 | GitHub Actions（push 到 main 自动构建部署） |
| 构建 | Astro 5 + Tailwind 4，28 页 |

> 部署过程中排掉的坑见文末「部署踩过的坑」。

## 原部署记录

| 项 | 值 |
| --- | --- |
| 公网地址 | `https://tackle-split-prizes-andreas.trycloudflare.com` |
| 本机 | `http://localhost:4322/` |
| 局域网 | `http://192.168.1.2:4322/` |
| 构建产物 | `E:\dev\git-user-analysis-web\dist`（28 页，1.9 MB） |
| 静态服务 | `scripts/serve.mjs`（零依赖 Node HTTP 服务） |
| 公网隧道 | `E:\dev\tools\cloudflared.exe`（Cloudflare 快速隧道） |
| 便捷脚本 | `start-site.cmd`（双击即可重启全链路） |

## 一键启动

双击 `E:\dev\git-user-analysis-web\start-site.cmd`，或：

```powershell
cd E:\dev\git-user-analysis-web
.\start-site.cmd
```

脚本会依次：构建 → 起静态服务（先杀掉占用 4322 的旧进程）→ 起隧道 → 打印公网地址。
公网地址同时写入 `PUBLIC_URL.txt`。

## 重要限制（务必知道）

**Cloudflare 快速隧道是临时的。**

- 每次重启进程，**公网域名会变**（随机生成），旧链接立即失效
- 进程被杀掉、机器休眠或重启，链接就断
- 无 SLA，Cloudflare 保留随时停用的权利
- 只适合**临时演示、给别人看一眼**

要长期稳定，需要二选一：

| 方案 | 需要什么 | 步骤 |
| --- | --- | --- |
| **GitHub Pages** | GitHub 账号（本机 `gh` 的 token 已失效，需 `gh auth login` 重新登录） | 把 `dist/` 推到 `gh-pages` 分支并开启 Pages |
| **Cloudflare 命名隧道** | Cloudflare 账号 + 一个域名 | `cloudflared tunnel login` → 建隧道 → 绑域名 → 写 `config.yml` |

## 关闭

任务管理器结束 `node.exe`（静态服务）与 `cloudflared.exe`（隧道）即可。
或：

```powershell
Get-Process node,cloudflared -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "E:\dev\*" -or $_.ProcessName -eq 'cloudflared' } | Stop-Process -Force
```

## 日志

| 文件 | 内容 |
| --- | --- |
| `serve.log` | 静态服务日志 |
| `cf.log` / `cf3.err` | 隧道日志，**公网 URL 在这里**（`https://*.trycloudflare.com`） |
| `dev.log` | Astro dev server 日志（开发用） |

## 排查

**隧道连不上（TLS handshake timeout）**
加 `--edge-ip-version 4 --protocol http2`。本机 IPv6 到 Cloudflare edge 不通。

**隧道报 ERR_NGROK_9009（ngrok 专用）**
本机有系统级 HTTP 代理 `127.0.0.1:7897`，ngrok 检测到代理会要求付费版。
cloudflared 不受影响，但**启动前要清空代理变量**，否则 edge 握手失败。

**端口 4322 被占用**
`start-site.cmd` 会自动 `taskkill` 占用进程。若手动启动，先执行：
```powershell
netstat -ano | findstr ":4322" | findstr LISTENING
taskkill /F /PID <PID>
```

**页面样式丢失**
`dist/_astro/*.css` 未生成。跑 `pnpm run build` 时确认没有报错，并检查 `sync-data.mjs` 是否成功（它负责把 vault 数据同步到 `src/data`）。

## 部署踩过的坑（补充：PAT 权限篇）

| 坑 | 现象 | 解法 |
| --- | --- | --- |
| **fine-grained PAT 默认只给读** | X-OAuth-Scopes 头为空；GET 全 200，PUT /contents 全 403 | token 设置里把 **Repository permissions → Contents** 改成 **Read and write** |
| **OAuth App ≠ PAT** | gh auth login --web 拿到的 token 只有读权限 | gh 内置 client_id 是 OAuth App，device flow 的 scope 参数对它无效；必须用 fine-grained PAT |
| **仓库权限 ≠ 写内容权限** | GET /collaborators/.../permission 返回 dmin，但推不上去 | fine-grained PAT 按 API 端点分别授权，dmin 不代表有 Contents 写权限 |
| **git 协议被拒但 API 可写** | git push 403，但 POST /issues 201 | fine-grained PAT 的写权限落在 REST API 上；改用 Contents API 逐文件上传（scripts/deploy.mjs） |
| **建仓接口 404** | POST /user/repos 返回 404 | token 缺 Account permission → Create repositories；或仓库已存在（用 contents 探测判断） |
| **Pages 用 legacy Jekyll 构建失败** | Build with Jekyll 步骤失败 | 把 Pages 的 build_type 切成 workflow，并提供 .github/workflows/deploy.yml |
| **setup-node 步骤顺序错** | Unable to locate executable file: pnpm | setup-node 的 cache:'pnpm' 需要 pnpm 先装好，**pnpm/action-setup 必须放在 setup-node 之前** |
| **写 contents 返回 422** | 不是权限问题 | 422 = **分支不存在**。先建分支（写一次探针文件即可） |

## 一键部署

\\\powershell
 = "github_pat_xxx"
cd E:\dev\git-user-analysis-web
node scripts/deploy.mjs
\\\

脚本会：诊断权限 → 探测/创建仓库 → Contents API 逐文件上传 → 开 Pages。
缺权限时直接输出修复指引，不会半途失败。
