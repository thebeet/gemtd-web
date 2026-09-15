# GemTD Web

Vue 3 + TypeScript + Three.js 实现的宝石塔防，支持浏览器单机和多人协作。

## 运行

```bash
pnpm install --frozen-lockfile
npm run dev
```

打开 `http://localhost:5173/game` 即可单机游玩；访问根路径会自动跳转到 `/game`。推荐 Node.js 22 和项目指定的 pnpm 10.24.0。

多人开发使用 `npm start`，将同一个 `/game?room=<房间名>` 链接分享给其他玩家。本地局域网测试使用机器的局域网地址，并为 Vite 配置 `--host`。

地图使用 37×37 网格，包含起点、终点和 5 个经过点，提供八种基础宝石塔、38 种合成塔及岩石障碍物。支持预设/自定义布局、塔与怪物详情、光环预览、伤害榜、战斗事件、波次自动存档，以及作弊模式下的变形和测试怪物。

每波进入建造阶段后，玩家在地图上放置 5 个随机颜色和品质的候选塔，再选择保留单塔、相同塔升阶或可用的配方合成结果；未保留的候选塔会变成岩石。玩家等级决定五档品质概率。

指挥官等级由击杀经验决定，并在同一房间内共享：Lv.2 至 Lv.5 的累计经验分别为 250、650、1200、1900。第 1–9 波每只怪提供 5 XP；其后每十波间隔依次为 10、15、20、25 XP；第 10、20、30、40、50 波 Boss 每只提供 300 XP。这些数值参照公开的 GemTD Dota 2 脚本实现；原版的精英怪额外经验机制尚未在本 demo 的刷怪表中启用。

`/game` 默认是纯前端单机模式：战斗逻辑在浏览器的 Web Worker 中以 20Hz 固定 Tick 推进，地图和战斗均不连接 WebSocket；存档保存在浏览器 IndexedDB。只需部署构建产物到任意静态托管服务即可游玩。

访问同一 `/game?room=<房间名>` 链接会进入联机模式：Yjs 共享地图和玩家建造状态，服务端负责权威战斗模拟。单机 Worker 和联机服务复用 `src/game/combat/engine.ts`，以 20Hz 推进战斗、通常以 10Hz 输出快照。前端插值渲染怪物、血条、弹道和命中特效。新加入同一房间的用户会直接收到当前战斗快照，战斗中地图布局锁定。

`npm start` 同时启动联机开发所需的：

- Vite 前端：`5173`
- WebSocket 服务：`1234`（Yjs 协作路径与 `/game-sync` 战斗同步路径）

单机开发只需 `npm run dev`，打开 `/game`（不要带 `room` 参数）。

## 部署提示

执行 `npm run build` 后，纯单机版可直接把 `dist/` 上传到静态托管，并为 `/game` 配置回退到 `index.html`。联机部署使用 `npm run server`，默认端口 `1234`；存在 `dist/` 时会同时提供网页，设置 `SERVE_STATIC=0` 可关闭静态服务。反向代理需转发 Yjs 和 `/game-sync` 的 WebSocket 请求。跨域部署应同时设置两个端点：

```bash
VITE_YJS_URL=wss://collab.example.com VITE_GAME_URL=wss://collab.example.com/game-sync npm run build
```

房间地图和战斗状态保存在服务内存中；服务重启后会丢失。浏览器存档保存在 IndexedDB：`gemtd-saves` 每个房间保留最近 40 条，`gemtd-layouts` 保留最近 40 个自定义布局。

## 检查与结构

```bash
npm test              # 确定性战斗回归、寻路和建造规则
npm run build         # 前后端类型检查及生产构建
npm run test:browser  # Chromium 中的 Worker、面板、IndexedDB 和联机检查
```

浏览器检查需要本机安装 `google-chrome`，也可用 `CHROME_BIN` 指定 Chromium 可执行文件。测试自动启动临时 Vite 和 `15134` 端口的联机服务，使用独立临时浏览器目录，结束后清理。

代码职责、重构范围、验证覆盖及现存边界见 [架构分析](docs/architecture.md)。
