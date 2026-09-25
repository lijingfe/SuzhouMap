# 姑苏寻迹数据来源

更新时间：2026-09-25

## 行政边界

- 苏州九个县级行政单元：OpenStreetMap WGS84，保存于 `public/data/suzhou-osm.json`，各要素保留原始 relation 链接。
- 苏州工业园区：OpenStreetMap relation `7363894`，通过 Overpass API 获取并转换为本地 GeoJSON。
- 工业园区关系的 OSM 标签引用了民政部行政区划查询作为来源；本项目将其作为功能区视觉展示，不将其表述为法定县级行政区。

旧 DataV 边界授权不清，不纳入 Git 和公开构建；运行时已统一使用 OSM 边界。地图仅用于探索展示，不作为测绘依据。

## 城市骨架和轨道交通

- 道路、水系、轨道线路与站点：OpenStreetMap，通过 Overpass API 于 2026-07-24 获取。
- OpenStreetMap 数据依据 ODbL 1.0 使用。
- 处理脚本：`scripts/fetch-osm-data.mjs` 与 `scripts/build-local-data.mjs`。
- 轨道线路依据 OSM 中 `network=苏州轨道交通` 的运营线路关系生成。

## 水域和绿地底图更新（2026-09-05）

- 新增 OpenStreetMap `natural=water` / `waterway=riverbank` 的完整 way 与 relation 几何；包括金鸡湖、独墅湖等多段岸线组成的湖泊。数据按六个地理分区请求，保留原始响应与 OSM 数据时间戳。
- 新增 `natural=wood/scrub/grassland/wetland`、`landuse=forest/grass/meadow/recreation_ground` 与 `leisure=park/garden/nature_reserve/golf_course` 的绿地面。
- 通过 Overpass 公共实例下载到 `public/data/raw/surface-water.json` 和 `landcover.json`，转换为本地底图；坐标沿用 OSM WGS84，许可为 ODbL 1.0。浏览器显示地图时无需访问在线地图服务。
- 多边形按 outer/inner 拼接，岛屿保留为空洞；不能闭合的岸线不强制连线。湖泊与绿地名称来自源数据，名称位置是面内显示锚点。
- 地铁筛选依据已选单向线路关系，站点保留所属线路集合。换乘站在任一所属线路开启时显示。

## 地点

- 当前地点候选库由 OpenStreetMap 中具名的旅游、历史、文化、园林、自然、餐饮、住宿和校园对象生成。
- 每条记录保留原始 OSM 对象链接、基础类型和更新时间。
- 标记为 `source-linked` 的记录具有网站或 Wikipedia 等附加来源标签；`osm-only` 表示尚未完成第二来源复核。
- 当前卡片对未复核的开放时间、票价明确显示信息缺口，不猜测实时安排。

### 精简地点内容更新（2026-09-05）

- `content/place-editorial.json` 保存 64 个精简地点的独立概览与探索建议；通过 `scripts/place-content.mjs` 在数据构建选定地点后合并，保持坐标、优先级与核心/扩展库划分不变。重新运行 `npm run data:build` 不会丢失补充内容。
- 背景资料通过 Wikimedia Core API 获取，原始摘录与原条目 URL 保存在 `content/research/`。有效百科背景来源在地点卡片中链接回 Wikipedia，并标注 CC BY-SA 4.0；正文为整理摘要，游览建议不冒充官方推荐。
- 横塘驿站补充 Wikidata `Q124079220` 基础身份来源（CC0）。无法取得有效第二来源的地点见 `DATA_GAPS.md`，不显示虚假的已核验标记。
- `sourceUpdatedAt` 保留原 OSM 数据日期，`contentUpdatedAt` 单独记录补充内容的日期。校园、历史设施和多馆区地点的访客、营业与票务安排仍需现场或官方确认。
- 可按需运行 `node scripts/fetch-place-research.mjs 地点名` 更新研究缓存；网络抓取不在网站运行时或常规构建时执行。

## 图片

- 精简地点的照片从相应百科条目定位到 Wikimedia Commons 文件，通过 Commons imageinfo 接口读取作者、许可证与原图地址；`content/place-photos.json` 保存逐图溯源记录。
- 已接入 45 个地点、51 张 JPEG 实景照片，保存在 `public/images/places/`，页面显示不依赖外部图片服务器。覆盖全部 12 处精简古典园林。每张图保留 Commons 文件页链接、作者和许可证链接；图片在卡片中按比例裁切显示。
- 当前只接受 CC BY、CC BY-SA、CC0 或公有领域标记的照片；未确认具体分馆/校区匹配的图片不接入。
- `scripts/fetch-place-photos.mjs` 为可选维护脚本，不在常规构建中访问网络。新照片候选仍须检查实际地点匹配，不因脚本能下载就视为内容核验完成。
- 未收录可靠照片时显示“暂未收录可核实的实景照片”；全部图片加载失败时显示“照片暂时无法读取”。单张加载失败会自动尝试剩余图片。

## 行政区概览

- 基础概览依据苏州市及各区县公开政府信息中的通用区域定位整理。
- 正式发布前仍需逐条补充对应政府页面链接和复核日期。

## 许可提示

公开派生地图数据库按 ODbL 1.0 提供；图片逐图保留许可证。详见 PUBLIC_DATA_NOTICE.md。2026-09-25 旅行指引与查阅边界见 RESEARCH_2026-09-25.md；建议时长为编辑估算，不是官方承诺。
