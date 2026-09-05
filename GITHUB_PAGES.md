# 姑苏寻迹 GitHub Pages 发布

仓库：https://github.com/lijingfe/SuzhouMap

网站：https://lijingfe.github.io/SuzhouMap/

## 本地运行

需要 Node.js 22.13 以上，推荐 Node.js 24。

首次从 GitHub 下载后，先将 `site-source.zip` 与 `public-assets.zip` 都解压到同一个目录，分别得到源代码和 `public/` 文件夹。Windows 可使用资源管理器解压，macOS/Linux 可运行 `unzip site-source.zip` 和 `unzip public-assets.zip`。

运行 `npm ci` 后，使用 `npm run dev` 启动原有本地开发版本。使用 `npm run build:pages` 构建静态版本，`npm run preview:pages` 在本地预览发布产物（访问输出地址的 `/SuzhouMap/` 路径）。

## 自动发布

仓库 Settings → Pages → Source 选择 GitHub Actions。推送 `main` 分支会执行 `.github/workflows/pages.yml`：解压已审核资源、安装依赖、构建静态网页、校验并发布。无须租服务器。

`public-assets.zip` 是仅含运行资源的压缩包，不包含开发依赖、缓存、原始采集文件或密钥。此次通过已登录的浏览器上传，源代码以 `site-source.zip` 提供；Actions 会先解压源代码，再解压资源包后构建。源代码可下载解压后查看和修改，不是只提供编译后的网页。

修改代码后，可运行 `node scripts/export-github-source.mjs --stage`，将 `work/github-source/` 内的内容压缩成新的 `site-source.zip` 上传。修改发布流程时，仓库中的 `.github/workflows/pages.yml` 也需要同步更新。后续配置 Git 推送后，可改为在仓库中直接维护展开的源代码。

更新地图数据或图片后，先运行 `node scripts/stage-public-assets.mjs`，再将 `work/github-assets/public` 压缩为根目录下的 `public-assets.zip` 并提交。公开资源包被本地 `.gitignore` 默认排除，审核后可明确添加；不要使用 `git add -f .`。

## 运行方式及限制

- 静态版本复用原 React 地图组件，不需要 Node.js 服务端或数据库。
- 地图 JSON 采用 gzip 文件，浏览器通过 DecompressionStream 解压，需较新的 Chrome、Edge、Firefox 或 Safari。图片按需加载。
- `PAGES_BASE_PATH` 默认 `/SuzhouMap/`。如果更改仓库名或使用根域名，请同时修改 Actions 环境变量并重新构建。
- 本地工作目录的旧行政边界保留不动；公开资源包使用 OpenStreetMap WGS84 边界。
- 收藏仍只保留在当前浏览器会话中，不会自动跨设备同步。
- 地图、百科和图片来源及许可见 `docs/PUBLIC_DATA_NOTICE.md` 和每个地点的来源链接。GitHub Pages 在不同地区的访问速度可能不同。
