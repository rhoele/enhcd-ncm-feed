# 网易云关注艺人新作速递 · enhcd-ncm-feed

> 把「我关注的艺人在网易云发了新东西」这件事，变成每天早上打开手机就能看到的一页静态信息流。

本项目解决的是**手机端查看关注艺人新作**的问题：本地电脑上的扫描后端再好用，手机浏览器也访问不了 `http://127.0.0.1`，HTTPS 页面更会直接拦掉混合内容请求。于是这里把「扫描」搬到 GitHub Actions，把「结果」变成同源静态 JSON，手机端只读文件，彻底绕开跨域、混合内容与内网穿透。

**线上地址**：<https://rhoele.github.io/enhcd-ncm-feed/>

当前快照规模（见 [`data/mobile/index.json`](data/mobile/index.json)）：

| 指标 | 数值 |
| --- | --- |
| 覆盖艺人 | 9 608 |
| 覆盖专辑 | 357 739 |
| 滚动窗口 | 7 天 |
| 最新一天条目 | 598（其中合辑 107） |

---

## 功能

打开页面后有三个标签页：

- **扫描新作** —— 关注艺人**本人**在窗口期内发行的专辑 / 单曲；
- **扫描合辑** —— 关注艺人**出现在别人名下**的合辑 / 精选集里（`resultTab = compilation`）；
- **厂牌汇总** —— 按发行厂牌聚合当天新作，便于按厂牌扫一遍。

其它细节：

- 手机 UA 与桌面 UA 使用同一套响应式布局（[`mobile-ui.css`](mobile-ui.css)），色板取自 Material 3 的 `#6750A4`；
- 支持「刷新」「上一天 / 下一天」在快照窗口内翻页，无网络时回退到浏览器缓存；
- 页面是纯静态的，可以「添加到主屏幕」当 PWA 用（[`manifest.webmanifest`](manifest.webmanifest)）。

---

## 工作原理

```
                     本地电脑（可选）                         GitHub
  ┌───────────────────────────────────────┐        ┌──────────────────────────────┐
  │  扫描后端 start-static.js  :8001       │        │  GitHub Actions (scan.yml)   │
  │  NeteaseCloudMusicApi     :3000       │        │  cron 每天 9 次（北京时间）  │
  │  CORS 代理 cors-proxy.js  :8012       │        │   ├─ 全量扫「新作」          │
  │         │                             │        │   └─ 分片扫「合辑」          │
  │         ▼                             │        └──────────────┬───────────────┘
  │  export-mobile-snapshot.js            │                       │ 写入并 commit
  │         │                             │                       ▼
  └─────────┼─────────────────────────────┘        ┌──────────────────────────────┐
            └──────────────────────────────────────▶│ data/mobile/*.json（gh-pages）│
                                                     └──────────────┬───────────────┘
                                                                    │ 同源读取（HTTPS）
                                                                    ▼
                                                     ┌──────────────────────────────┐
                                                     │ 手机 / 电脑浏览器：index.html │
                                                     │  只读快照，无需后端           │
                                                     └──────────────────────────────┘
```

两条产出通道共用同一套快照格式（[`scripts/lib/mobile-snapshot.js`](scripts/lib/mobile-snapshot.js)）：

- **本地导出**：`node scripts/export-mobile-snapshot.js` 从本机缓存（`VA_Owned_Album_Cache.json` 等）导出，可选地从运行中的本地后端拉一次「合辑参与」结果（`--va-api`）一并写入；
- **云端扫描**：`scripts/cloud-scan.js` 在 Actions 里逐艺人调用网易云接口，跑完直接写 `data/mobile/` 并 commit 回 `gh-pages`。

---

## 快照数据契约 `data/mobile/`

移动端与安卓端都只依赖这几个文件，**格式即接口**：

| 文件 | 作用 |
| --- | --- |
| `index.json` | 目录：`latest_date`、`days`、`dates[]`（每天条数与生成时间）、`artist_count`、`album_count`，以及合辑分片游标 `compilation_shard` |
| `YYYY-MM-DD.json` | 单日信息流：`date`、`generated_at`、`items[]` |
| `artists.json` | 云端扫描用的艺人清单（`artist_id` 数组） |
| `album-dates.json` | 专辑发行时间缓存，供合辑通道跨次复用，避免重复请求 |

单日文件里的每条 `item`：

```jsonc
{
  "id": 123456,                 // 专辑 ID
  "name": "专辑名",
  "artistName": "艺人名",
  "artistIds": [2116],          // 合辑条目可能对应多个关注艺人
  "picUrl": "https://...",      // 封面（统一为 https）
  "publishTime": 1760000000000, // 发行时间（毫秒）
  "label": "厂牌",
  "type": "扫描新作",            // 或「扫描合辑」
  "resultTab": "new"            // 或 "compilation"
}
```

> 通知去重键请使用 `netease:album:<id>:<publishTime>`，不要用 `label` / `resultTab` / `generated_at` 这些会变的字段。

---

## 云端自动扫描

工作流：[`.github/workflows/scan.yml`](.github/workflows/scan.yml)

**出发时间**（cron 是 UTC，下面已换算成北京时间，每天 9 次）：

```
00:05  00:50  04:00  07:00  10:00  13:00  16:00  19:00  22:00
```

00:05 那次保证「过 0 点就能看到当天新作」，00:50 再兜底一次（Actions 的 cron 是 best-effort，高峰期常延迟 5~30 分钟）。

**两阶段扫描**：

1. **新作**：对全部艺人并发调用 `/artist/album`。实测云端每次约 4 秒，并发 16 时约 44 分钟跑完 9 608 位艺人。
2. **合辑**：成本高得多（每位艺人约 6 个请求，全量一次要 6.9 万请求 ≈ 3 小时），所以按 `--compilation-shards`（默认 8）**分片轮转**——每次只扫 1/8 的艺人，游标 `compilation_shard` 存在 `index.json` 里逐次前进；已确认发行时间的专辑写进 `album-dates.json` 跨次复用。每天 9 次与 8 片互质，几天内即可覆盖全量。

**手动触发**（Actions → 云端扫描新作 → Run workflow）：

| 输入 | 默认 | 说明 |
| --- | --- | --- |
| `max_artists` | `0` | 只扫前 N 位艺人，`0` 表示全部（试跑用） |
| `concurrency` | `16` | 并发数 |
| `compilation_shards` | `8` | 合辑分片数 |

job 时限 90 分钟，合辑阶段另有 1 500 秒硬预算，超时即停、剩下的交给下一次轮转。

**建议配置 Secret**：`NETEASE_MUSIC_U`（网易云 `MUSIC_U` Cookie 值）。带上登录态能显著降低匿名接口的限流与风控概率。

---

## 公开页的隐私边界

这一页是公开的，所以有一条硬规则：**公开站点上不允许出现任何个人配置**。

- [`seed-settings.js`](seed-settings.js) 只包含三个字段，不含 Cookie、歌单、个人缓存：

  ```js
  window.NAF_SEED_SETTINGS = { "publicMode": true, "staticMode": true, "staticSnapshotBase": "data/mobile" };
  ```

- [`public-session.js`](public-session.js) 在页面最早期接管环境，**判定与浏览器 UA 无关**——只要 hostname 以 `.github.io` 结尾或脚本带 `data-public="true"` 就生效，因此**电脑版浏览器访问时同样受保护**：
  - `window.NAF_PUBLIC_MODE = true`，前端进入「静态只读模式」；
  - 把 `localStorage` 换成基于 `sessionStorage` 的**当前标签页隔离代理**（前缀 `naf-private-v2:<path>:`），并清掉发布者可能遗留的 `netease-*` / `naf_*` / `spotify` 等键与 `naf_settings` Cookie；
  - 包装 `window.fetch`，只放行两类目标：**本站快照**（`data/mobile/` 的 GET）与**用户自己填写的 HTTPS 后端**；请求一律 `credentials: 'omit'`、`redirect: 'error'`、`referrerPolicy: 'no-referrer'`，Cookie 走 `x-ncm-cookie` 头而不是 URL 参数。
- 页面内置「自带后端」入口：访客可以填自己的 HTTPS API 地址 / Cookie / 歌单链接，**只保存在当前标签页的 sessionStorage**，关掉即失效，不会串到别人那里。
- 发布前有两道闸门，workflow 里每次都会跑：

  ```bash
  node scripts/lib/check-public.js .     # 校验 seed-settings 不含个人字段、产物中无 Cookie 泄漏
  node --test scripts/test-public.js     # 校验请求不会把 cookie 写进 URL、非白名单目标被拒
  ```

发布目录由开发仓的 `scripts/prepare-public.js` 生成：它**绝不复制本地种子与本地存储导出**，最后才写出上面那份 `seed-settings.js`。

---

## 本地开发

```bash
npm install
```

三个服务（端口可在环境变量里覆盖）：

| 服务 | 默认端口 | 启动 |
| --- | --- | --- |
| NeteaseCloudMusicApi | 3000 | 自行启动 API 服务 |
| 扫描后端 | 8001 | `node start-static.js` |
| CORS 代理 | 8012 | `node cors-proxy.js` |

浏览器打开 <http://127.0.0.1:8001/> 即为本地增强版；在这个地址上**不会**进入公开只读模式，可以扫码登录、导入歌单、实时扫描。

导出移动端快照：

```bash
node scripts/export-mobile-snapshot.js --days 7 --va-api http://127.0.0.1:8001
```

常用参数见文件头注释（`--src` / `--out` / `--keep-old` / `--no-compilations`）。

---

## 部署到 GitHub Pages

仓库默认分支就是发布分支 `gh-pages`，页面由仓库根目录直接托管（含 `.nojekyll` 与 `404.html`）。

- 双击 `部署到GitHub Pages.bat` → `deploy-pages.ps1`：自动识别 Git 身份、关联远端并强推；
- 双击 `重新生成种子配置.bat` → `regen-seed.ps1`：重新生成 `seed-settings.js`；
- 发布地址形如 `https://<user>.github.io/<repo>/`，自定义仓库名无需改代码。

---

## Android 应用

安卓端源码放在**开发仓**的 `android-app/` 目录（本仓是 Pages 发布仓，只含网页与快照数据），是一个独立的 Gradle 工程：

| 项 | 值 |
| --- | --- |
| 语言 / JDK | Java 17 |
| Gradle / AGP | 8.7 / 8.1.2 |
| compileSdk / minSdk | 33 / 23 |
| 应用 ID | `com.naf.mobile`（安装后显示为 **NAF Mobile**） |

当前形态是 **Material 3 风格的原生信息流 + WebView 设置页**：

- 启动页读 `data/mobile/` 快照渲染卡片列表，按「扫描新作 / 扫描合辑」分标签；
- 设置页保留原来的 WebView 界面（扫码登录、导入 IDs、导入设置文件），供高级用法使用；
- 通知去重键与快照格式对齐（见上文 `netease:album:<id>:<publishTime>`），为后续「新歌推送」预留。

构建（工程内已带 Gradle Wrapper，首次构建会自动下载 Gradle 8.7）：

```bash
cd android-app
gradlew.bat assembleDebug     # macOS / Linux 用 ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

发布签名读根目录的 `keystore.properties` + `keystore/naf-release.keystore`（这两个文件不入库）。
`local.properties` 里的 `sdk.dir` 需指向本机 Android SDK，例如 `D:\Android\Sdk`。

> 注意：`android-app/app/src/main/assets/www/` 里的网页是**离线兜底副本**，与仓库根目录的 `index.html` 不是同一份，改完前端需要手动同步。

---

## 目录结构

```
.
├─ index.html                  增强版入口（标签页：新作 / 合辑 / 厂牌）
├─ app.js                      前端逻辑：扫描、渲染、静态只读模式
├─ mobile-ui.css               手机 / 桌面共用的响应式布局与 MD3 色板
├─ public-session.js           公开页隔离：sessionStorage 代理 + fetch 白名单
├─ seed-settings.js            公开种子（只有 3 个字段）
├─ storage-bridge.html         本地存储导入导出桥
├─ manifest.webmanifest / sw.js
├─ data/mobile/                快照数据（index / YYYY-MM-DD / artists / album-dates）
├─ scripts/
│  ├─ cloud-scan.js            云端逐艺人扫描（新作 + 合辑分片）
│  ├─ export-mobile-snapshot.js 本地导出移动端快照
│  ├─ test-public.js           公开模式测试
│  └─ lib/
│     ├─ mobile-snapshot.js    快照格式唯一生产者
│     ├─ ncm-read-client.js    只读 NCM 客户端（缓存 / 合并 / 退避）
│     └─ check-public.js       发布前隐私检查
└─ .github/workflows/scan.yml  定时扫描与自动提交
```

---

## 常见问题

**手机上打开是空的？**
先看 `data/mobile/index.json` 的 `updated_at`：如果 Actions 还没跑完（零点那次通常 00:50 左右出结果），页面会展示上一次的快照。手工触发一次 workflow 即可立刻刷新。

**为什么手机上不能像电脑那样实时扫描？**
实时扫描依赖本地后端（`127.0.0.1:3000`），手机上这个地址指向手机自己。要么把快照当数据源（本方案默认行为），要么在页面里填一个公网 HTTPS 后端地址。

**合辑标签页条目比新作少很多？**
合辑走分片轮转，单次只扫 1/8 的艺人，属预期行为，多跑几次会自动补全。

**Actions 扫描失败 / 被限流？**
在仓库 Secrets 里加 `NETEASE_MUSIC_U`，或把 `concurrency` 调低到 8 再手动触发。

---

## 免责声明

本项目只做**只读**数据聚合（艺人专辑列表、专辑元数据、歌曲详情），不提供任何下载、播放或绕过付费的能力。数据来自网易云音乐公开接口，版权归原作者与平台所有，仅供个人学习与自用。
