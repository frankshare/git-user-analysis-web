# 部署说明

## 当前状态

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
