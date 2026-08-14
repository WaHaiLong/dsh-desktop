# DeepSeek Harness Desktop

点击下方语言块标题,在 **简体中文 / English** 之间切换。

<details open>
<summary><b>简体中文</b>(默认)</summary>

# DeepSeek Harness Desktop

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)(`dsh`)的跨平台桌面客户端。

它在 Electron 壳中包装 `dsh web` 界面,并捆绑了**独立的 Node.js 运行时**来运行 harness,
确保原生模块(`node-pty`、`sharp`、`koffi`)在每个平台上都以正确的 ABI 加载 ——
无需本地安装 Node.js。**下载即用,启动即用。**

## 工作原理

- Electron 只作为壳:它使用捆绑的 Node 启动 `dsh web --host 127.0.0.1 --port 0`,
  从 stdout 读取端口,然后在窗口中加载 `http://127.0.0.1:<port>/`。
- `DSH_HOME` 指向应用的每用户数据目录,配置和 API Key 持久保存在那里。
- 退出时终止 `dsh` 子进程。

## 金蝶 MCP 集成

内置对接 [kingdee-mcp](https://github.com/WaHaiLong/KingdeeMCP)—— 一个
金蝶云星空 MCP 服务器,让 harness 可以用自然语言查询/操作金蝶 ERP 单据
(采购/销售/库存/生产/成本/固定资产)。

菜单 **设置 → 金蝶 MCP 设置** 打开一个表单,填写 4 个连接参数
(`KINGDEE_SERVER_URL` 须含 `/k3cloud/`、`KINGDEE_ACCT_ID`、`KINGDEE_USERNAME`、`KINGDEE_PASSWORD`)。
保存后,应用以 `--patch` 覆盖层写入 `mcp-client` 配置并重启服务器;
dsh 通过**捆绑的 `uv` 二进制**启动 kingdee-mcp 服务器(`uv tool run kingdee-mcp`)。

`uv` 已捆绑进应用(无需手动安装)。首次运行会自动把 Python + kingdee-mcp 下载进 uv 缓存。

## 构建

只需要构建机器上装有 Node.js(任意较新版本)。

```sh
npm install                 # 应用 devDeps(electron、electron-builder)
npm run fetch:node          # 为当前平台下载独立 Node → resources/node/
npm run runtime:install     # 安装 @deepseek-ai/dsh → resources/dsh/node_modules/
npm run dist                # 在 dist/ 下生成安装包
# 或一键执行:npm run build
```

每个平台要在**对应平台**上构建(独立 Node 二进制是分系统的)。CI 会自动完成这件事 ——
见 `.github/workflows/release.yml`。

## 本地开发运行

```sh
npm install && npm run fetch:node && npm run runtime:install
npm start
```

## 发布产物

| 系统 | 格式 |
|------|------|
| macOS | `.dmg`、`.zip` |
| Windows | NSIS `.exe`(x64、arm64) |
| Linux | `.AppImage`、`.deb` |

## 许可证

MIT。DeepSeek Harness 本身为 MIT 协议(© DeepSeek AI);见
[THIRD_PARTY_NOTICES.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/THIRD_PARTY_NOTICES.md)。

</details>

<details>
<summary><b>English</b></summary>

# DeepSeek Harness Desktop

Cross-platform desktop app for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`).

It wraps the `dsh web` UI in an Electron shell and bundles a **standalone Node.js runtime** to run the
harness, so native modules (`node-pty`, `sharp`, `koffi`) load with the correct ABI on every platform —
no local Node.js install required. **Download, launch, use.**

## How it works

- Electron is only the shell: it spawns `dsh web --host 127.0.0.1 --port 0` using the bundled Node,
  reads the port from stdout, then loads `http://127.0.0.1:<port>/` in the window.
- `DSH_HOME` is set to the app's per-user data directory, so config/API keys persist there.
- On quit, the `dsh` child process is terminated.

## 金蝶 MCP 集成 (Kingdee MCP)

Built-in support for connecting [kingdee-mcp](https://github.com/WaHaiLong/KingdeeMCP) — a
金蝶云星空 (Kingdee Cloud Star) MCP server — so the harness can query/operate Kingdee ERP documents
(采购/销售/库存/生产/成本/固定资产) in natural language.

Menu **设置 → 金蝶 MCP 设置** opens a form for the 4 connection params
(`KINGDEE_SERVER_URL` 须含 `/k3cloud/`、`KINGDEE_ACCT_ID`、`KINGDEE_USERNAME`、`KINGDEE_PASSWORD`).
On save, the app writes an `mcp-client` entry as a `--patch` overlay into dsh and restarts the
server; dsh then spawns the kingdee-mcp server via the **bundled `uv` binary**
(`uv tool run kingdee-mcp`).

`uv` is bundled into the app (no manual install). The first run auto-downloads Python +
kingdee-mcp into uv's cache.

## Build

Requires Node.js (any recent version) on the build machine only.

```sh
npm install                 # app devDeps (electron, electron-builder)
npm run fetch:node          # download standalone Node for this platform → resources/node/
npm run runtime:install     # install @deepseek-ai/dsh → resources/dsh/node_modules/
npm run dist                # build installers into dist/
# or all three: npm run build
```

Build each platform **on** that platform (the standalone Node binary is per-OS). CI does this
automatically — see `.github/workflows/release.yml`.

## Dev run

```sh
npm install && npm run fetch:node && npm run runtime:install
npm start
```

## Release artifacts

| OS | Format |
|----|--------|
| macOS | `.dmg`, `.zip` |
| Windows | NSIS `.exe` (x64, arm64) |
| Linux | `.AppImage`, `.deb` |

## License

MIT. DeepSeek Harness itself is MIT (© DeepSeek AI); see
[THIRD_PARTY_NOTICES.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/THIRD_PARTY_NOTICES.md).

</details>
