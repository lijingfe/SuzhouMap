# 姑苏寻迹 · SuzhouMap

苏州全域探索地图，支持电脑、平板和手机。使用固化的 OSM 数据，无地图 API Key，无业务后端。

在线访问：https://lijingfe.github.io/SuzhouMap/

## 本地运行

需要 Node.js 24。克隆仓库后：

```sh
npm ci
npm run dev
```

按终端提示打开本地地址。首次启动会生成轻量地图与细节分块，不需要重新下载 OSM 原始数据。

预览与线上一致的静态版本：

```sh
npm run build:pages
npm run preview:pages
```

打开 http://127.0.0.1:4173/SuzhouMap/ 。不能直接双击 HTML，地图加载需要 HTTP 服务。

## 使用

- 初始以姑苏区为中心、15×，支持 1–100× 缩放。右下角“姑苏 / 全域”可快速重置视野。
- 默认显示古典园林、更多地点，地铁默认隐藏。手机左上角面板默认收起。
- 手机支持单指拖动、双指缩放，底部详情可半屏、全屏阅读或收起；顶部固定的 × 可关闭全部详情，保留收藏和地图中心。
- 搜索支持名称、别名、拼音和标签，优先匹配完整名称。可用 ↑↓ 选择结果、Enter 打开、Esc 收起结果；中文输入法确认文字不会误打开地点。
- “我的收藏”保存在本机浏览器中，自动迁移旧会话收藏，并在同一浏览器的标签页之间同步。不上传、不跨设备同步；清理网站数据会移除收藏，禁止存储时界面会提示限制。
- 收藏模式显示全部已收藏地点，并提供点击定位列表，不受分类和精简筛选限制；返回探索后恢复原筛选。
- 打开两个地点后可比较离线交通估算；不是实时导航。
- 64 个精简地点有逐项概览、看点与到访提醒。45 个地点有 51 张已署名实景照片；缺图时不会用别处照片代替。

## 数据与性能

概览底图约 873 KB gzip（旧完整底图约 9.62 MB），详细道路、水域、绿地在停止拖动后按视野加载；小比例尺不载入细节。Worker 负责下载、解压和 JSON 解析，Canvas 缓存绘图路径，拖动期间变换缓存画布。内存细节缓存最多 18 块，浏览器持久缓存最多 36 个哈希地图资源。照片按需加载。

完整派生数据库仍在公开构建中保留以便下载，但交互网页不再请求完整 basemap 文件。运行时数据版本固定，不表示当前道路、票务或运营状态。

- 数据来源与许可：[docs/PUBLIC_DATA_NOTICE.md](docs/PUBLIC_DATA_NOTICE.md)
- 未完成核验项目：[docs/DATA_GAPS.md](docs/DATA_GAPS.md)
- 本次内容查阅：[docs/RESEARCH_2026-09-25.md](docs/RESEARCH_2026-09-25.md)

## 测试

```sh
npm run build:pages
npm test
npm run test:browser
npx tsc --noEmit
```

浏览器测试在 Windows 使用已安装的 Edge，其他系统先运行 `npx playwright install chromium`。测试覆盖 320/390/768/1024/1440 像素视口、触摸、详情、筛选、收藏、交通、失败重试、键盘搜索、跨标签页同步及存储不可用；不能替代所有实体手机测试。

## 更新与发布

直接维护 Git 源码，不再上传 ZIP。推送 main 后 GitHub Actions 自动构建、测试并发布 Pages。操作说明见 [docs/GITHUB_PAGES.md](docs/GITHUB_PAGES.md)。

编辑 `content/place-editorial.json`、`content/place-visits.json` 或图片清单后运行 `npm run data:content`，检查生成的 `public/data/places.json` 并一并提交。地图维护脚本需要单独抓取原始数据；普通开发与部署不运行网络采集。
