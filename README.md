# Demo Gallery

agent 生成的测试 demo 陈列页。零构建、零依赖：一个静态页面 + 一个 manifest。

```
index.html              陈列页（搜索 / 标签 / 状态 / 排序 / 详情浮层）
assets/gallery.{css,js} 页面样式与逻辑
demos/
  manifest.json         扫描生成，勿手改
  <slug>/
    demo.json           元数据
    index.html          demo 入口（自包含，离线可跑）
    poster.jpg          可选，卡片缩略图（16:10，1280×800 起）
tools/scan-demos.mjs    扫描 demos/ 生成 manifest
```

## 本地运行

```bash
node tools/scan-demos.mjs        # 每次新增/修改 demo 后执行
python -m http.server 8123       # 任意静态服务器，file:// 下 fetch 会被拦
# open http://127.0.0.1:8123/
```

## 新增一个 demo

1. 建目录 `demos/<slug>/`，slug 用小写连字符（`sorting-race`）。
2. 放 `index.html`：自包含，不依赖 CDN（离线/内网也能跑）。
3. 写 `demo.json`：

```json
{
  "title": "Sorting Race",
  "summary": "一句话说清它演示什么，控制在 90 字内。",
  "tags": ["canvas", "algorithms"],
  "status": "stable",
  "agent": "omp / deepseek-v4-flash",
  "effort": "medium",
  "prompt": "生成它的原始 prompt，详情页可一键复制复现。",
  "createdAt": "2026-11-03",
  "notes": "实现上的取舍、已知问题。可省略。",
  "interactive": true
}
```

4. 跑 `node tools/scan-demos.mjs`。校验失败会打印 `skip <slug>: 原因` 并以非 0 退出。

字段约定：

| 字段 | 必填 | 说明 |
|---|---|---|
| `title` / `summary` | 是 | 卡片标题与两行简介 |
| `tags` | 否 | 小写、短；同时用于筛选和搜索 |
| `status` | 否 | `stable`（默认）/ `wip` / `broken` |
| `agent` | 是 | 生成者，形如 `omp / deepseek-v4-flash`；卡片只显示 `/` 后的模型名 |
| `effort` | 是 | 模型档位，必须是 `low` / `medium` / `high` 之一 |
| `prompt` | 否 | 原始 prompt，用来复现/迭代 |
| `createdAt` | 否 | 缺省取 `demo.json` 修改时间 |
| `poster` | 否 | 相对 demo 目录的图片路径，16:10（建议 1280×800 或 1600×1000）。缺省时卡片显示渐变占位图，hover 才有实时预览 |
| `interactive` | 否 | 纯静态展示时设 `false` |

未知字段会警告；缺 `index.html` 或 JSON 非法会被跳过。

## 为什么要这些信息

陈列页面向“翻了 50 个 demo 想找一个能用的”的场景，所以卡片只放决策所需：

- **标题 + 一句话**：判断它是不是我在找的东西。
- **缩略图**：视觉筛掉 80% 不相关的。优先用 poster；没有 poster 时才在 hover 时挂实时 iframe。
- **状态点**：避免点开一个坏掉的 demo。
- **标签**：跨 demo 横向对比（都是 canvas 的、都是 UI 组件的）。
- **agent / effort / 日期**：追溯是哪个模型、哪档 effort、哪一版生成的，便于横向对比模型产出。

详情页才展开复现所需：prompt、备注、入口路径、文件列表，以及桌面/平板/手机三档预览宽度。

## 性能约束

- 卡片默认不加载 iframe，`pointerover` 才挂载、移出 280ms 后卸载，全局最多 3 个 live。
- live iframe 固定 1280×800 渲染后 `transform: scale()` 缩到卡片宽度，缩略图接近桌面截图而不是被压扁的移动版。
- 预览 iframe `pointer-events: none`，点击始终落到卡片上（打开详情），不会被 demo 吃掉。
