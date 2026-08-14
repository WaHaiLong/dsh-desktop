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
