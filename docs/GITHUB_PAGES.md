# GitHub Pages 发布

仓库：https://github.com/lijingfe/SuzhouMap
网址：https://lijingfe.github.io/SuzhouMap/

当前采用真实源码与必要运行资源直接入 Git，旧 ZIP 仅留作本机历史备份，不再参与构建。

1. 在仓库 Settings → Pages 中保持 Source 为 GitHub Actions。
2. 修改、验证后提交并推送 main：
   `git add <确认过的文件>` → `git commit -m "..."` → `git push origin main`。
3. 在 Actions 查看 Publish Gusu Trails to GitHub Pages，成功后刷新网站。

工作流：检出源码 → npm ci → 构建轻量概览/地图分块 → Vite 静态构建 → 数据与浏览器回归 → 上传 out → Pages 部署。

不要提交 node_modules、out、dist、原始采集缓存、.env、密钥或旧 DataV 边界。公开资源来自有明确许可的 OSM 与已署名图片，详见 PUBLIC_DATA_NOTICE.md。移动目录后 Git 仍可正常使用，运行命令时进入实际项目目录。

网页运行不需要租服务器，也不需要上传完整开发目录。GitHub Pages 免费提供静态 HTTPS 托管；首次访问和资源下载速度受网络环境影响，不是离线 PWA。
