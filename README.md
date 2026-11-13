# Voice Account PWA / Android Shell

## Personal Ledger Upgrade (In Progress)

Accounts and categories: use the Assets tab. Add a bank/wallet with an opening balance
(negative balances represent debt); select an account in the existing bill form.
Old bills remain unassigned and never change new opening balances. Bill mutations and
account journal entries share a transaction. Edits/deletions append reversal entries.
Transfers move funds only, never income/expense. Referenced accounts/categories are
archived rather than erased; renaming a category preserves its original historical key.
The v3 upgrade adds stores without rewriting existing bills or budgets. Asset totals
include archived balances. The chart and journal show posted asset changes.

Calendar: Home month arrows select historical months. Red daily numbers are income;
green numbers are expense. Select a day to filter its editable bill list; select it again
to return to the month. Budget warnings always use the actual current month.
The header search combines keyword, amount, inclusive dates and type. Recent 10 queries
are stored locally. Statistics includes category ranking and an annual 12-month mode;
the pie still follows the selected month.

Backup controls below Home: Complete Backup exports a versioned JSON containing all
stores (including budgets/accounts/journal). Import/Restore previews JSON before an
explicit replacement transaction; export the current complete backup first. Legacy
bills-only JSON is supported but contains no accounts or budgets. CSV/Excel export all
bills with date/type/amount/category/note/account. CSV imports require those six Chinese
headers, exact existing category/account names, a YYYY-MM-DD date and positive two-decimal
amounts. Invalid rows block the entire import; create missing accounts/categories first.
CSV import appends and never deduplicates identical legitimate bills automatically.
Libraries are bundled locally by npm prepare, including licenses; there is no CDN.
Android opens the system Save As document picker; cancelled/failed saves report errors.
Native document-provider compatibility still requires a device test.

Android now has a custom offline Whisper plugin. See **Android 端侧离线 Whisper** below:
building this version additionally requires the prepared model/source, NDK and CMake.
The older web-only ZIP and Web Speech API notes do not describe the new Android voice path.

The HTML, CSS and JavaScript sources remain in the repository root. There is no
frontend compiler or bundler.

## Setup And Sync

Requires Node.js 22 or newer (Capacitor 8).

```sh
npm ci
npx cap sync
```

`npm ci` prepares the local Capacitor runtime and the ignored `www/` directory.
The Capacitor copy hook refreshes these assets before every native copy,
including copies triggered by sync.
Run `npm run prepare:web` to refresh them manually. Serve the repository over
localhost or HTTPS to use the PWA; do not open `index.html` with `file://`.

Only `index.html`, `css/`, `js/`, `manifest.json`, `sw.js` and the official
Capacitor runtime are copied into `www/`. This directory and copied native
assets are generated, not source files. Commit the Android project and lockfile.

## Capacitor Configuration

- App name: 语音记账
- App ID: `com.duancreate.voiceaccount`
- Web directory: `www`
- `bundledWebRuntime: true` is retained for the requested configuration, but
  Capacitor 8 no longer consumes this legacy option. The preparation script
  explicitly copies `@capacitor/core/dist/capacitor.js` instead.

Capacitor rejects `webDir: "./"`. Copying the project root would also include
development files and recursively copy the Android output. The staging step
avoids both problems without moving the web sources or adding a build tool.

## Verification Scope

```sh
npm test
npx cap doctor android
```

Resource synchronization does not compile or install an Android application.
An APK build additionally requires Android Studio, Android SDK 36 and JDK 21.
Use Studio's local SDK path and Gradle JDK settings as described below; global
`ANDROID_HOME` and `JAVA_HOME` changes are not required. The minimum Android API is 24.
The shell initialization step did not generate an APK, signing key or release build.
Android WebView speech recognition and JSON downloads must be tested on a
device later; browser support does not guarantee the same native behavior.

## Statistics And Budgets

The Statistics tab draws a current-month category expense pie and six calendar
months of income/expense trends with native Canvas. Select a pie slice or its
legend entry to see that category's current-month expense records. A monthly
data table provides a text alternative to the trend chart.

Monthly total and six independent category limits are stored in the separate
`budgets` store in IndexedDB version 2. The upgrade preserves the original
`bills` store, record fields and auto-increment IDs. Limits persist across months;
only spending and remaining amounts are recalculated, with no rollover. Blank
limits disable the corresponding warning. Warnings never prevent bill entry.
The existing JSON export remains a bills-only backup, not a budget backup.

New modules are included in the offline shell and native resource sync. After
an installed PWA update, close all old tabs and reopen it to activate the new
worker. On an open page, calendar-based views refresh at the next periodic check
or when returning from the background.

```sh
npm test
npm exec --yes --package=playwright -- node --test tests/manual-bills.test.cjs
npx cap sync android
```

The browser suite uses Chrome on Windows by default; set `BROWSER_PATH` for
another Chrome/Chromium executable. It covers legacy data migration, persistent
budgets, transaction failures, month changes, chart selection, offline CRUD,
voice confirmation, small-screen amounts and simulated keyboard viewports.
Physical keyboard/safe-area behavior and Android WebView still require device
testing. Waveform bars are a recording-state animation, not measured audio.

### UI Polish And Historical Views

Statistics month arrows read existing bills without saving a filter or changing
the database. The pie, selected-category details and six-month trend follow the
selected month; home budgets always use the actual current calendar month.
The next-month arrow stops at the current month.

Summary amounts animate from zero and keep two decimals and thousands
separators. Reduced-motion preferences bypass the counter and page/disclosure
animations. Amounts fit their available containers, including narrow screens.
Recording ripples and waveform bars are decorative state feedback only.
Deletion uses an accessible confirmation dialog with cancel/Escape support;
success/failure notifications continue to use the existing timed Toast.

## Android Studio 构建 APK 分步指南

本指南只生成真机测试用的 Debug APK，不涉及 Release 签名或商店发布。
第十三步仅准备工程、同步网页资源和校验配置，未下载 SDK、运行 Gradle 构建或生成 APK。
完成下列本机安装和设置后，再由 Android Studio 执行同步和构建。

### 1. 工程配置与本机检查（2026-11-12）

| 检查项 | 配置或结果 |
| --- | --- |
| 应用名称 | `语音记账`，Capacitor 配置与安卓字符串资源一致 |
| 包名 / namespace / applicationId | `com.duancreate.voiceaccount`，与 MainActivity 包路径一致 |
| 工具链 | Capacitor 8.6.0、Gradle Wrapper 8.14.3、Android Gradle Plugin 8.13.0 |
| SDK | compile / target 为 API 36，min 为 API 24（Android 7.0） |
| JDK 21 | 实际路径 `C:\Users\Lenovo\.jdks\ms-21.0.12.1`，java / javac 均返回 `21.0.12.1` |
| 系统 `JAVA_HOME` | 路径开头含不可见字符 `U+202A`，指向的路径无效；本工程不依赖此值 |
| Android SDK | 环境变量未设置，项目无 `local.properties`；默认目录及检查的常见目录未找到 SDK |
| Android Studio | 默认安装路径未找到；若已安装到其他位置，请自行打开并核对 SDK Location |
| APK 构建 | 本步未执行，不能将资源同步成功视为 APK 编译通过 |

`android/gradle.properties` 已固定本机 Gradle JDK：

```properties
org.gradle.java.home=C:/Users/Lenovo/.jdks/ms-21.0.12.1
```

请求中的 `C:\Users\Lenovo.jdks\ms-21.0.12.1` 不存在，使用核实后的 `.jdks` 目录。
属性文件使用正斜杠，避免 Windows 反斜杠被解释为转义字符；不添加引号，不指向 `bin`。
此配置只影响本工程，不修改全局 Git、系统 Java 或用户环境变量。
换电脑时应将该属性和 Studio 的 Gradle JDK 一起改为当地有效的 JDK 21 路径。

本步验证记录：`npx.cmd cap sync` 无报错；18 个网页资源文件在源码、`www/` 和
安卓 `assets/public/` 的 SHA-256 全部一致，官方 Capacitor 运行时和原生配置一致。
`npm.cmd test` 通过 86/86 项，`npx.cmd cap doctor android` 检查通过。
这些检查不运行 Gradle，不验证 SDK 安装、APK 编译或真机功能。

### 2. 下载安装 Android Studio

1. 从 [Android Studio 官方网站](https://developer.android.com/studio) 下载 Windows
   稳定版安装程序，按向导安装，不使用来源不明的离线包。
2. 选择支持当前 AGP 8.13.0 的稳定版；可在
   [官方兼容说明](https://developer.android.com/build/releases/about-agp#android_gradle_plugin_and_android_studio_compatibility)
   核对。不要为消除 IDE 提示而直接升级 AGP、Gradle 或 Capacitor。
3. 首次启动完成 Setup Wizard。需要下载 SDK 时由你在向导中确认，不执行自动安装脚本。
   不需要模拟器时，可不安装 Android Emulator 和系统镜像。

### 3. 在 SDK Manager 安装组件

欢迎页选择 `More Actions > SDK Manager`，或已打开项目时进入
`Tools > SDK Manager`。先记录顶部 Android SDK Location，例如
`C:\Users\Lenovo\AppData\Local\Android\Sdk`，以界面实际路径为准。

| 页签 | 组件 | 用途 |
| --- | --- | --- |
| SDK Platforms | Android 16 / Android SDK Platform 36 | 必需，勾选标准 API 36，不以 API 34/35 或预览版替代 |
| SDK Tools | Android SDK Build-Tools 36.0.0 | 按本项目准备要求安装，展开 Show Package Details 选择确切版本 |
| SDK Tools | Android SDK Build-Tools 35.0.0 | 一并安装；当前 AGP 8.13.0 默认使用此版本，含未显式指定版本的原生模块 |
| SDK Tools | Android SDK Platform-Tools | 安装 ADB，用于真机连接与可选 USB 安装 |
| SDK Tools | Android SDK Command-line Tools (latest) | SDK 管理工具；本指南不要求运行 sdkmanager 命令 |

点击 `Apply / OK`，阅读并确认许可证，等待所选组件安装完成。
安装两版 Build-Tools 可共存，不需要降低 compileSdk / targetSdk，也不修改生成的依赖模块。
首次构建前将依赖准备齐全；不要依赖构建中临时自动补装 SDK。

### 4. 准备稳定的工程路径与网页资源

当前仓库为 `D:\app开发`，中文路径可能触发 Windows 上 Android Gradle Plugin 的路径检查。
稳妥方式是先通过文件资源管理器将**整个项目**复制到新的纯英文目录
`D:\voice-account`（目标目录不存在时再复制），保留原仓库，不覆盖现有目录。
不能只复制 `android/`：原生工程还引用根目录 `node_modules/@capacitor/android`。
不通过 `android.overridePathCheck=true` 关闭路径检查来强行构建。

复制后，在新项目根目录的 PowerShell 中逐条运行以下资源准备命令，
任一步失败即停止排查。需要已安装 Node.js 22+；这些命令不下载 Android SDK、不编译 APK。

```powershell
Set-Location -LiteralPath 'D:\voice-account'
npm.cmd ci
npx.cmd cap sync
```

Windows 使用 `.cmd` 可避免 PowerShell 对 npm/npx 的脚本执行策略限制。
同步会重建 `www/`，将最新首页、统计、预算、动效等网页资源复制到
`android/app/src/main/assets/public/`。每次更新网页后都要重新同步，
Android Studio 的 Gradle Sync 不会代替 Capacitor 资源同步。

### 5. 导入已有安卓工程并固定 JDK

1. 欢迎页选择 `Open`，或 `File > Open`，选择
   `D:\voice-account\android`，不是仓库根目录，也不是单独的 `app/`。
   确认这是你自己的工程后接受信任提示。
2. 如果自动 Gradle Sync 已开始且报 Java/SDK 错误，先停止同步，完成下述设置后重试。
   不从命令行运行 Gradle，因此不使用系统中无效的 `JAVA_HOME`。
3. 打开 `File > Settings > Build, Execution, Deployment > Build Tools > Gradle`，
   将 Gradle JDK 设为 `C:\Users\Lenovo\.jdks\ms-21.0.12.1`。
   若列表没有该路径，使用 `Add JDK` / `Browse` 选择已有目录；不用下载 JDK。
   使用项目自带的 Gradle Wrapper，不改用本机其他 Gradle 版本。
4. 在 `File > Project Structure > SDK Location` 或 SDK Manager 中确认 SDK 路径。
   Studio 可写入本机的 `android/local.properties`；此文件已被 Git 忽略，不提交。
5. 选择 `File > Sync Project with Gradle Files` 或工具栏同步按钮。
   首次同步需要联网取得 Gradle Wrapper 和 Google / Maven Central 依赖，
   由你在 IDE 中发起；等待同步成功后再构建。

如果仍提示无效 Java 路径，核对项目 `gradle.properties` 与 IDE 的 Gradle JDK 是否一致，
并检查本机用户级 Gradle 属性是否覆盖了工程设置；不要沿用含 `U+202A` 的旧路径。
若提示 SDK 缺失，返回 SDK Manager 安装表中组件，不能跳过错误继续构建。
若提示中文路径错误，使用上一步的英文路径副本，不修改全局构建配置。

### 6. 一键构建 Debug APK

1. 打开 `View > Tool Windows > Build Variants`，确认 `app` 的 Active Build Variant
   为 `debug`；如果只有一个默认变体，仍确认没有切到 release。
2. 选择 `Build > Generate App Bundles or APKs > Generate APKs`。
   某些 Studio 版本的同一操作叫 `Build > Build Bundle(s) / APK(s) > Build APK(s)`。
   不选 `Generate Signed Bundle / APK`，也不以工具栏 `Run` 代替可分发 APK 构建。
3. 等待 Build 窗口显示 `BUILD SUCCESSFUL`，点击通知中的 `locate`。
   只在本次构建成功后使用生成的 APK，并检查文件更新时间，避免误用旧包。
   Debug 签名由工具链自动生成，不需要配置 Release 密钥。

APK 相对位置为 `android\app\build\outputs\apk\debug\app-debug.apk`。

- 推荐英文路径副本的预期完整位置：
  `D:\voice-account\android\app\build\outputs\apk\debug\app-debug.apk`
- 若保留当前目录且实际构建通过，预期完整位置：
  `D:\app开发\android\app\build\outputs\apk\debug\app-debug.apk`

以上是**构建成功后的预期路径**，第十三步未生成安装包，也未验证 Gradle 编译成功。

### 7. 手机安装与覆盖更新

1. 文件安装：将 APK 通过 USB、局域网或文件传输发送到安卓手机，用文件管理器打开。
   按系统提示允许该文件管理器“安装未知应用”，安装完成后可关闭此授权。
   最低系统为 Android 7.0（API 24）。
2. 可选 USB 安装：开启开发者选项和 USB 调试，连接电脑并在手机上确认授权。
   在 PowerShell 中使用实际 SDK 路径运行下列命令；设备应显示 `device`，
   不应是 `unauthorized`。多设备时通过 `-s <设备序列号>` 选择目标设备。

```powershell
& 'C:\Users\Lenovo\AppData\Local\Android\Sdk\platform-tools\adb.exe' devices
& 'C:\Users\Lenovo\AppData\Local\Android\Sdk\platform-tools\adb.exe' install -r 'D:\voice-account\android\app\build\outputs\apk\debug\app-debug.apk'
```

覆盖安装保留数据的前提是包名和签名兼容。若签名不一致，不要直接卸载：
卸载会删除本地账单，先导出备份。来自不同电脑的 Debug 包可能使用不同调试密钥。

### 8. 权限与真机验证边界

| 配置 | 说明 |
| --- | --- |
| `INTERNET` | 网络访问，普通权限，不会出现运行时授权弹窗 |
| `RECORD_AUDIO` | 麦克风危险权限；支持音频采集的 WebView 请求时，由 Capacitor 桥接运行时授权 |
| `MODIFY_AUDIO_SETTINGS` | Capacitor 音频采集权限流程使用的普通权限 |
| `android.hardware.microphone`，required=false | 无麦克风设备仍可安装并使用手动记账 |
| 存储 | 本地 IndexedDB 不需要共享存储权限；不添加过时的读写外部存储权限或全盘管理权限 |

权限声明不等于 WebView 支持 Web Speech API。此步骤不改动语音解析、识别逻辑或导出实现，
因此不能保证 Android WebView 的语音识别与 Blob JSON 下载行为；需要安装后实测。
现有 FileProvider 不等同于已实现原生文件导出，增加存储权限也不能修复 WebView 下载兼容性。

真机上检查：手动新增/编辑/删除、重启后数据保留、离线打开和手动记账、统计与预算、
麦克风允许/拒绝时的提示、JSON 导出文件是否确实落盘。
语音在线服务及 WebView 能力不可用时，应按现有提示改用手动记账，不将其视作编译故障。

### 9. 本地文件与版本管理

`android/**/build/`、`android/.gradle/`、`android/local.properties`、`www/`、
同步生成的原生网页资源、`node_modules/`、APK/AAB 和签名文件均已被忽略。
SDK、缓存、调试密钥、临时文件和 APK 留在本机，不纳入 Git。
本步只提交工程配置和说明文档，不修改账单业务、数据层、数据库或语音规则。

参考：[安装 Studio](https://developer.android.com/studio/install)、
[SDK Manager](https://developer.android.com/studio/intro/update#sdk-manager)、
[AGP 8.13 工具链说明](https://developer.android.com/build/releases/past-releases/agp-8-13-0-release-notes)、
[构建和运行应用](https://developer.android.com/studio/run)。

## 云端打包 APK 操作步骤

### 配置与上传包

入口：[VoltBuilder 上传页面](https://volt.build/upload/)。使用账号登录，确认当前套餐支持
Capacitor Android Debug 构建；额度、费用和可用工具链以平台当时的说明为准。
本地不需要 Android SDK、Android Studio 或有效的 `JAVA_HOME`。

根目录 `voltbuilder.json` 使用平台官方 Capacitor 配置字段：

```json
{
  "androidPackageType": "apk",
  "release": "debug",
  "capacitor": { "jvm_21": true }
}
```

应用名称 `语音记账` 与包名 `com.duancreate.voiceaccount` 继续从
`capacitor.config.json` 的 `appName` / `appId` 读取，不在 VoltBuilder 配置里添加
未定义的 `name`、`packageName` 或 `buildType` 字段。平台通过上传页面的 **Android**
按钮选择，不用新增 iOS 工程。Debug 使用平台默认调试签名，不提供 keystore、别名、密码
或商店凭据，也不创建 `certificates/`。`apk` 是可直接安装的包，不是 AAB。

生成或更新上传包，在项目根目录运行：

```powershell
pwsh -NoProfile -File .\scripts\package-voltbuilder.ps1
```

需要 Node.js 22+、PowerShell 和已安装的项目 npm 依赖；缺少依赖时先运行 `npm.cmd ci`。
脚本只准备网页文件并压缩，不下载 SDK、不运行 Gradle。输出覆盖同名旧上传包：
`D:\app开发\voice-account-build.zip`。ZIP 已被 Git 忽略，不提交生成的压缩包。

ZIP 根目录直接包含以下内容，不嵌套额外项目文件夹：

```text
capacitor.config.json
voltbuilder.json
package.json
package-lock.json
README.md
index.html / manifest.json / sw.js / capacitor.js / capacitor.js.map
css/ / js/ / www/
scripts/prepare-web.cjs
scripts/configure-cloud-android.cjs
```

所有页面、样式、业务模块和第三方中文数字库及其许可证保持原样，`www/` 是最新资源副本。
不上传 `.git/`、`node_modules/`、`android/`、本机 JDK/SDK 路径、签名文件、测试、旧设计文档、
缓存或构建产物。它们在本地仍有开发用途，不以“清理上传包”为由删除源码或 Git 历史。

### 不上传原生工程时的权限处理

VoltBuilder 官方支持缺少 `android/` 时生成原生工程。上传副本的 `package.json` 增加
网页 `build` 和 Capacitor `copy:after` / `update:after` 构建钩子；本地根目录的
`package.json`、锁文件和现有安卓工程保持不变。
钩子通过 Capacitor CLI 自带的 XML 解析器，为云端新生成的 Manifest 补齐
`INTERNET`、`RECORD_AUDIO`、`MODIFY_AUDIO_SETTINGS`，并把麦克风硬件设为可选。
不会添加全盘存储权限，也不会写入本机的 `org.gradle.java.home`。
若平台日志出现 Manifest 配置失败，应停止使用该产物并查看日志，不能忽略权限错误。

当前平台工具链说明包含 JDK 21、SDK Platform 36、Build-Tools 35.0.0 / 36.0.0
及 Gradle 8.14.3，符合现有 Capacitor 8 工程的主要要求。平台的 Capacitor 文档仍标注
beta，实际支持状态以当次构建日志为准，不因 ZIP 检查通过就认定云端编译成功。

### 上传、构建与下载

1. 打开上传页面并登录，点击 **Android** 选择 `voice-account-build.zip`，或拖到 Android
   上传区域。只上传这个干净 ZIP，不要将整个仓库另行压缩，也不上传含个人账单的备份文件。
   上传会把工程源码交给第三方服务处理，请先确认平台条款和账号额度。
2. 等待平台安装 npm 依赖、生成原生工程、同步资源并构建 Debug APK。
   不要选择 Release / Bundle / Google Play 发布。保留构建 ID 和日志；失败时通过
   `View Log` 查看原因，不把旧的成功记录当作本次结果。
3. 成功后，在同一上传页面的构建结果区点击 **Download** 下载 APK；也可使用结果页面提供的
   设备链接或二维码。云端下载 URL 由平台生成，没有固定的本机 `android/app/build/` 路径。
   电脑通常保存在浏览器下载目录，例如 `C:\Users\Lenovo\Downloads`，名称以实际下载为准。
   不假设平台链接长期有效，及时保留 APK 和本次日志。
4. 将下载的 APK 传到手机，或在手机打开结果链接下载；用文件管理器打开 APK，按提示允许
   该来源“安装未知应用”。安装完成后可关闭此权限，不需要连接开发电脑或本地 SDK。

### 覆盖更新与功能验证

覆盖安装需要相同包名、兼容版本号和**相同签名证书**。平台默认 Debug 签名不保证与本地
Android Studio 的 Debug 签名相同，也不在此承诺不同云端构建始终使用同一证书。
遇到签名冲突不要直接卸载：卸载或清除应用数据会删除本地账本，先确认备份实际存在。
当前 JSON 导出只包含账单，不包含预算设定，也没有 JSON 导入恢复功能。
浏览器 PWA 数据与独立 APK 的 WebView 数据不会自动迁移。
后续正式稳定更新需要单独规划版本号和长期保管的签名，本步不配置 Release 签名。

干净包包含完整离线网页资源、IndexedDB 数据模块、统计和预算模块；打包不会迁移个人数据。
但配置检查和浏览器测试**不能保证 Android WebView 的全部能力**：

- 语音依赖 Web Speech API 和在线识别服务，Manifest 权限不会给不支持的 WebView 增加该 API。
  当前实现不支持时提示使用手动记账，本步不引入原生语音插件或修改识别逻辑。
- JSON 备份使用 Blob 下载，安卓壳中的落盘行为必须真机验证；没有原生文件下载桥接，
  不能用“导出成功”提示代替检查手机上确实生成了可读取的 JSON 文件。
- 安装后检查手动新增/编辑/删除、离线重启和数据保留、分类统计、历史月份、预算持久化，
  以及麦克风允许/拒绝状态。云端构建成功不代表这些项目已经通过真机测试。

本地检查命令：

```powershell
npm.cmd test
node --test tests/cloud-android.test.cjs
npm.cmd exec --yes --package=playwright -- node --test tests/manual-bills.test.cjs
```

官方参考：[Capacitor 工程和配置](https://volt.build/docs/set_up-capacitor/)、
[云端工具链](https://volt.build/docs/build-environment/)、
[上传构建教程](https://volt.build/tutorial/)。本步只准备上传工程，不代用户登录或提交付费构建。

本步验证记录（2026-11-12）：现有单元测试 86/86、云端权限钩子测试 3/3、浏览器回归
44/44 通过。干净 ZIP 解压后已实际执行 `npm ci --offline`、网页 `build`、
`cap add android` 和 `cap sync android`，无 SDK 下载或 Gradle 编译；新生成的名称、包名、
三项权限、可选麦克风声明及 18 个网页资源校验通过。此记录不是云端 APK 构建或真机验收结果。

## Windows 本地离线语音后端（Python）

本步仅增加 `server/`，不更改前端录音、语音解析、IndexedDB 或记账流程。
仓库没有已实现的 Node.js 语音后端，因此无需删除旧后端；根目录的 npm 依赖仍用于
Capacitor 同步、云端打包和测试，不能当作废弃后端移除。

**重要边界：当前页面仍使用原来的 Web Speech API，尚未切换到此接口。**
后续需单独接入录音上传。服务固定监听电脑的 `127.0.0.1`，不开放局域网或公网。
手机 APK 中的 `127.0.0.1` 指向手机自身，不能直接调用电脑上的这个服务；本方案不是
“把 Python 后端打进 APK 就能手机离线识别”，安卓端独立离线识别需另外设计原生集成。

### 工程结构

```text
server/
  app.py               Flask 接口、内存解码、模型加载
  requirements.txt     固定依赖版本（含直接使用的 PyAV、NumPy）
  start.bat            Windows 一键启动
  .env.example         可选配置示例
  .gitignore           排除虚拟环境、模型、缓存、录音、真实环境变量
  tests/test_app.py    无模型下载的接口与音频处理测试
  .venv/               本地生成，不提交
  models/              首次下载的模型，不提交
```

### 安装与启动

1. 安装 [Windows 版 64 位 Python](https://www.python.org/downloads/windows/)，
   推荐 **Python 3.13**，安装 Python Launcher。当前固定依赖最低要求 Python 3.12；
   不使用系统旧版 Python 3.8，不需要安装 Node.js 后端、CUDA、Visual C++ 编译工具或外部 FFmpeg。
   PyAV 的二进制包已包含解码所需库，CPU / INT8 推理不要求独立显卡。
2. 双击 `D:\app开发\server\start.bat`。脚本会进入自己的目录，在 `.venv` 安装依赖，
   不修改全局 Python 环境；使用 `--only-binary=:all:`，没有兼容 wheel 时直接报错，不尝试源码编译。
   依赖版本已满足时跳过安装，后续启动无需联网安装包。首次依赖安装和模型下载需要联网。
3. 模型加载完成后，终端出现 `Running on http://127.0.0.1:5000` 才表示接口可用。
   终端保持打开，按 `Ctrl+C` 停止。端口被占用时修改 `.env` 的 `ASR_PORT`，不要开启公网监听。

也可以在 PowerShell 手动安装和启动：

```powershell
cd 'D:\app开发\server'
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --only-binary=:all: -r requirements.txt
.\.venv\Scripts\python.exe app.py
```

不依赖 PowerShell 虚拟环境激活，不必修改执行策略。如果 Python 是自定义安装，使用其完整
`python.exe` 路径执行 `-m venv .venv` 即可；本机已用 Python 3.13 创建独立环境。

### 模型与离线模式

默认 `base` 是多语言模型，强制中文 `language="zh"`，默认 CPU / INT8，模型只加载一次，
识别时使用本地语音活动检测以减少静音幻觉。模型权重约 145 MB，另有分词器、运行依赖和内存开销；
不以删除必要模型或虚拟环境来节省空间。Windows 不支持符号链接时可能出现 Hugging Face
缓存提示，不影响识别，也不需要管理员运行。

首次启动会从 Hugging Face 下载公开模型到 `server/models/`，不需要付费 API Key，
识别没有第三方调用次数限制，但仍受电脑 CPU、内存和本服务请求限制约束。
**仅模型下载访问第三方，录音和识别文本不发送第三方，不保存在文件或应用日志中。**
操作系统内存换页不属于应用可保证的内存物理存储范围。

复制配置后，可启用严格本地模式：

```powershell
Copy-Item .env.example .env
# 编辑 .env：WHISPER_LOCAL_FILES_ONLY=1
.\start.bat
```

`WHISPER_LOCAL_FILES_ONLY=1` 不查询或下载模型，模型尚未准备好则启动失败。
`WHISPER_MODEL=small` 可换用更大模型，通常更准但更占磁盘且更慢；不要使用只支持英文的 `base.en`。
若模型下载失败，先检查到 Hugging Face 的网络连接；也可在另一台电脑准备好完整的
**CTranslate2 格式**模型目录（含 `model.bin`、`config.json`、`tokenizer.json`、词表），
复制到本机并设置 `WHISPER_MODEL=models/base-local`，不是下载任意 `.pt` 文件即可使用。

### 接口调用

```text
POST http://127.0.0.1:5000/api/asr
Content-Type: multipart/form-data
文件字段：audio（且只能上传一份音频）
成功：HTTP 200，Content-Type: text/plain; charset=utf-8
响应示例：今天午饭花了28元
```

PowerShell 调用示例（使用自己在本机保存的测试录音，不把录音加入 Git）：

```powershell
curl.exe --fail-with-body -F "audio=@C:\Users\Lenovo\Downloads\recording.webm" http://127.0.0.1:5000/api/asr
```

后续前端接入时使用 `FormData` 的 `audio` 字段，浏览器自动生成 multipart 边界，
不要手动设置 `Content-Type`。成功响应使用 `response.text()`，不是 JSON；
先判断 `response.ok`，不要把错误提示当作识别文本送给记账解析器。

- WebM / Opus 和 WAV 根据真实内容解码，统一为 16 kHz 单声道 float32 后送入模型。
- 每个文件最多 **5 MiB（5,242,880 字节）**、**30 秒**。请求整体额外预留 64 KiB multipart
  头部空间，文件上限不因此放宽；逐帧检查实际解码时长，不只信任扩展名或元数据，不截断超时录音。
- 上传接收、解码和识别全部使用内存，不使用默认的磁盘临时上传文件；请求结束或失败均关闭上传流。
  一次仅处理一条识别，处理完成释放音频引用，保留模型以便复用。
- 错误同样返回纯文本：`400` 缺少/错误文件字段，`403` 非许可来源，`413` 超出大小或
  multipart 限制，`422` 无效/超时音频或未检测到语音，`429` 正在处理其他录音，`503` 模型识别失败。
  结果和错误均加 `Cache-Control: no-store`。
- CORS 仅许可 `.env.example` 中列出的本机 HTTP 来源（默认含 8000、8100、5173 端口），
  未许可的 `Origin` 在识别前拒绝；同时限制 Host 为 `localhost` / `127.0.0.1`，不开启调试器。
  本机应用仍可无 Origin 调用，这不是面向多用户或不可信本机进程的认证服务。
- 不支持通配来源或 `file://` 的 `null` 来源。后续网页从其他本机端口打开时，增加对应精确来源；
  浏览器可能要求本地网络访问许可，HTTPS 页面也可能受混合内容规则限制，不能只靠 CORS 解决。

### 后端验证

```powershell
cd 'D:\app开发\server'
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
.\.venv\Scripts\python.exe -m pip check
```

接口测试使用真实内存 WAV / WebM 编解码，仅将耗时模型推理替换为测试替身，不会下载模型。
覆盖采样率与声道归一化、边界时长、压缩音频超时、文件大小、内存流关闭、无语音、错误恢复、
来源限制和并发拒绝。真实模型验收需另用中文录音，不能以接口测试通过代替识别准确率。

本机验证（2026-11-12）：`base` 下载加载成功，并以 `WHISPER_LOCAL_FILES_ONLY=1` 和
`HF_HUB_OFFLINE=1` 启动，使用 Windows 本地中文合成语音经真实 HTTP 接口识别 3 句，
28、32、5000 三个金额均正确；“工资”误识别为“公司”，另有繁简混合输出。
这是合成语音烟雾测试，不是真人、方言、噪声或手机麦克风准确率评测。当前不添加文本纠错、
繁简转换或业务解析规则，也不自动保存识别结果，接入后仍须用户确认。

最终回归：后端 23/23、原有单元测试 86/86、云端配置测试 3/3、浏览器测试 44/44 通过；
真实模型对静音返回 `422`，未生成识别内容。一键脚本从项目外目录启动及 loopback 监听已验证。
本次没有修改前端源码或数据库，也没有生成新的 APK 或上传 ZIP。

## Android 端侧离线 Whisper

本节为第十八步的最新安卓语音方案，覆盖前面“安卓仅使用 Web Speech API”及“ZIP 不含原生工程”
的旧步骤说明。网页 / PWA **仍保持 Web Speech API**，不接入 Python 上传；`server/` 可独立保留，
安卓识别不启动、不连接它，也不要求同一 Wi-Fi。

### 插件与识别链路

```text
按住说话（原有样式和操作）
  -> Capacitor WhisperPlugin
  -> AudioRecord / 16 kHz / 单声道 / PCM16（内存）
  -> JNI / whisper.cpp / CPU 本地中文推理
  -> 原有 parseVoiceBill -> 原有确认表单 -> 用户确认后入账
```

`MainActivity` 注册自定义插件，Java 单工作线程串行运行模型加载、录音和识别，不阻塞 WebView。
模型直接从 APK 的 AssetManager 读取，不复制到公共存储，不生成录音文件，不请求任何网络。
原生接口如下，适配层生成的 `sessionId` 用于丢弃取消后、旧权限回调和旧识别结果：

- `startRecording({ sessionId })`：申请麦克风权限，加载内置模型并开始录音。
- `stopRecordingAndRecognize({ sessionId })`：停止录音并返回 `{ text: "识别文本" }`；无有效语音返回空字符串。
- `cancelRecording({ sessionId })`：停止对应录音，协作取消推理并丢弃结果。
- `recordingStopped` 事件：携带 `sessionId`，通知适配层已达到静音或时长上限。

只在 Capacitor 原生 Android 中选择此插件；插件不可用时提示手动记账，**不偷偷降级联网识别**。
安卓断网不再隐藏或禁用语音按钮，未准备好数据库、操作繁忙等原有禁用条件仍保留。
权限被拒、模型加载失败、麦克风错误和设备不兼容均恢复手动入口，不改账单数据。
首次权限弹窗造成的短暂失焦不会取消启动；开始录音后的失焦、取消手势和进入后台会停止会话。

单条录音最长 30 秒；初始静音约 3 秒、有效声音后连续静音约 1.5 秒自动停止。
使用 PCM 能量阈值剔除静音和孤立短促噪声，不是能理解语义的 VAD，嘈杂环境可能影响自动停录，
仍可松手结束。推理强制 `zh`、不翻译、不携带上笔上下文、不修改文本或原有语义解析规则。
原生推理约 120 秒协作超时，前端原生处理超时约 150 秒，网页保持原来的 15 秒。
用户必须核对金额、分类和备注；离线和量化不代表零误识别。

### 准备模型与源码

开发机首次执行以下命令，需要联网，但不会下载 Android SDK，也不会编译 APK：

```powershell
cd 'D:\app开发'
pwsh -NoProfile -File .\scripts\prepare-android-whisper.ps1
npx.cmd cap sync android
```

准备脚本固定官方 `whisper.cpp v1.8.2`，提交
`4979e04f5dcaccb36057e059bbaed8a2f5288315`，源码包 SHA256：
`ec8e33f4c838ed459ad0a23da255c0262f150a6f54839a17e504ddf1495305d5`。
源码位于 `android/app/src/main/cpp/third_party/whisper.cpp/`，不进入 Git，脚本可重复准备。
不依赖构建时 CMake FetchContent 下载，发布 APK 也不携带下载代码。

模型为**多语言 base 的 Q5_1 量化版**，并非中文专用模型，不能替换成 `base.en` 或 faster-whisper
使用的 CTranslate2 `model.bin`。内置位置：

```text
android/app/src/main/assets/models/ggml-base-q5_1.bin
59,707,625 字节（约 59.7 MB / 56.9 MiB）
SHA256: 422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898
```

模型已被 `.gitignore` 排除，克隆仓库后必须重新准备。`-VerifyOnly` 只校验，不联网：

```powershell
pwsh -NoProfile -File .\scripts\prepare-android-whisper.ps1 -VerifyOnly
```

Gradle 的 `verifyWhisperAssets` 在构建前检查模型长度、SHA256 和源码版本；缺失会报错，不生成
看似可用但没有模型的安装包。模型设置为 APK 非压缩资产，通过 JNI 流式读取；首次录音加载到内存，
后续复用，退出 Activity 后释放。录音及识别文本不写日志、不落盘。

### Android Studio 构建要求

沿用前文 Android Studio 的导入步骤，打开 `D:\app开发\android`，额外在 SDK Manager 中勾选
**Show Package Details** 并安装：

- Android SDK Platform 36、Build-Tools 36.0.0、Platform-Tools、Command-line Tools。
- NDK (Side by side) **28.2.13676358**，CMake **3.22.1**。
- Gradle JDK **21**。本机 `org.gradle.java.home` 仍保留；其他电脑应改为自己的 JDK，不能照用本机路径。

插件通过 CMake 编译 `libvoice_whisper.so`，CPU-only，不需要 CUDA、GPU 或后端 Python。
支持 `arm64-v8a` 真机与 `x86_64` 模拟器，最低 Android API 24；本版不构建 32 位 ABI，
32 位专用设备不能安装此 APK。使用基础 ARMv8 指令配置，不强制可选 FP16/dotprod/SVE 指令；
NDK r28 和链接参数为 16 KiB 内存页提供构建配置，仍需在对应设备验证。

同步成功不等于 C++ 编译成功。准备依赖后，用 Studio 的 **Build > Build Bundle(s) / APK(s) >
Build APK(s)** 构建 Debug；输出仍为：
`D:\app开发\android\app\build\outputs\apk\debug\app-debug.apk`。
模型本身增加约 60MB，最终 APK 还包含两个 ABI 的原生库与网页资源，准确大小以构建产物为准。
运行需要额外模型及推理内存，低内存设备可能加载失败。冷启动、30 秒录音推理耗时及发热因 CPU
差异很大，本机没有真机基准，不能承诺秒回或与桌面 Python 后端相同的速度。

### 云端上传包已调整

```powershell
pwsh -NoProfile -File .\scripts\package-voltbuilder.ps1
```

脚本先离线验证已准备的模型和源码，再生成根目录 `voice-account-build.zip`。
与旧版不同，现在 ZIP **保留必要的 `android/` 工程**，包括原生插件、JNI / CMake、构建必需的
whisper.cpp / ggml 源码及许可证、内置模型和 Gradle Wrapper；根目录仍直接包含项目文件，
无额外包裹目录。源码中的服务器示例、测试和无关工具不上传。
不包含 `node_modules/`、`.git/`、Python `server/`、`.venv/`、构建缓存、签名、`local.properties`
或生成的安卓网页副本；云端 cap sync 从 `www/` 重建网页副本。
上传副本会移除 `org.gradle.java.home`，本地工程不变。

**云端平台必须支持自定义原生工程、NDK 28.2.13676358 和 CMake 3.22.1。**
本次未登录 VoltBuilder 或执行云端构建，平台现有套餐、上传大小上限和工具链能否满足要求须以
实际日志或平台支持为准。不再使用自动重新生成空安卓壳的旧流程，否则会丢失插件。
不能为适配平台而省略模型，或把 Windows Python 服务打包当成手机离线识别。

### 验证与真机验收

```powershell
npm.cmd test
node --test tests/native-voice.test.cjs tests/cloud-android.test.cjs
npm.cmd exec --yes --package=playwright -- node --test tests/manual-bills.test.cjs
```

纯 Java 录音缓冲测试无需 SDK（把 JDK 路径替换为本机实际路径）：

```powershell
& 'C:\Users\Lenovo\.jdks\ms-21.0.12.1\bin\javac.exe' -d .cache/pcm-test android/app/src/main/java/com/duancreate/voiceaccount/PcmCapture.java tests/android/PcmCaptureTest.java
& 'C:\Users\Lenovo\.jdks\ms-21.0.12.1\bin\java.exe' -cp .cache/pcm-test com.duancreate.voiceaccount.PcmCaptureTest
```

Android instrumentation 测试 `WhisperAssetsTest` 可在 Studio 连接设备后运行，实际检查 APK 模型哈希、
原生库链接和模型加载；本机缺少 SDK/NDK 和设备，尚未运行。它也不能替代麦克风真实识别验收：

1. 开启飞行模式并关闭 Wi-Fi，首次冷启动 APK，在无任何后端的情况下授权麦克风、录入中文短句。
2. 检查 28 元、32.50 元、收入 5000 元等金额，确认前账本不增加，修改并确认后仅写一条。
3. 检查纯静音、30 秒上限、提前松手、首次拒绝/再次授权、取消、锁屏/后台、连续多次录音。
4. 检查首次加载与推理耗时、内存和温升，两个 ABI、Android 24+ 与 16 KiB 页设备按实际覆盖记录。
5. 断网验证手动 CRUD、预算、统计、备份文件实际落盘；备份在 Android WebView 的限制仍需原有真机验收。

本步交付状态是**工程接入与自动化边界验证**，不是“APK 已编译”或“真机完全离线识别通过”。
模型与源码资源已在本机准备，网页布局、CSS、db.js、预算表、解析规则和保存流程保持不变。

本机回归记录（2026-11-12）：单元测试 94/94（含原生适配边界 8 项），浏览器 48/48，
云端权限配置 3/3，未改动的 Python 后端 23/23，JDK PCM 缓冲测试通过；`cap sync android`
成功。浏览器原生测试替换了 Capacitor 插件边界，并非运行了手机 AudioRecord / JNI。
上传 ZIP 已检查原生源码、模型哈希及本机路径排除，不代表 VoltBuilder 已编译成功。

上游来源：[whisper.cpp v1.8.2](https://github.com/ggml-org/whisper.cpp/tree/v1.8.2)、
[量化模型](https://huggingface.co/ggerganov/whisper.cpp)、
[OpenAI Whisper](https://github.com/openai/whisper)。发布时保留相应 MIT 许可证，不承诺模型准确率。

## GitHub Actions 自动构建安卓 APK

工作流为 `.github/workflows/android-build.yml`，名称 **Android Debug APK**。
它直接使用仓库内已有的安卓原生工程，保留 WhisperPlugin、JNI 和 CMake 配置，
不重新生成空壳、不需要本机 Android SDK / NDK，也不使用 Python 后端。
本次只提交工作流与说明；**本地配置检查通过不等于 GitHub 云端编译或真机识别通过**。

### 环境与构建步骤

| 项目 | 云端配置 |
| --- | --- |
| 运行器 | `ubuntu-latest`，单次任务超时 60 分钟 |
| Node.js | `22.x`，匹配 Capacitor 8.6.0 要求；`npm ci` 按锁文件安装 |
| Java | Temurin JDK `21` |
| Android SDK | `platforms;android-36`、`build-tools;36.0.0`、`platform-tools`、Command-line Tools |
| 补充 Build-Tools | `35.0.0`，满足当前 AGP 8.13.0 及依赖模块的默认版本 |
| 原生工具链 | NDK `28.2.13676358`、CMake `3.22.1`，与现有工程一致 |
| APK | Debug，包名 `com.duancreate.voiceaccount`，不配置 Release 签名 |
| 构建产物 | `voice-account-debug-apk`，保留 30 天，仓库或组织策略不能限制得更短 |

工作流顺序：检出代码 → 安装 npm 依赖 → 原有单元测试 → 配置 JDK / SDK / NDK / CMake →
准备 Whisper → `npx cap sync android` → `chmod +x gradlew` → `assembleDebug` → 校验 APK → 上传。
SDK 安装步骤会自动接受 Android SDK 许可证；使用前应确认你同意相应许可条款。
官方 Actions 及 Android 环境 Action 固定到提交 SHA；更新时应核对版本，而不是随意替换工具链。

Whisper 资源复用 `scripts/prepare-android-whisper.ps1`，Ubuntu 运行器使用自带的 PowerShell：

- 源码来自官方 `ggml-org/whisper.cpp` 的固定提交，由 GitHub codeload 下载。
- 模型来自项目维护者的 Hugging Face `ggerganov/whisper.cpp` 固定版本，
  使用 `ggml-base-q5_1.bin`，不使用仅英文的 `base.en`。
- 两者都检查 SHA-256，不匹配即停止。源码、下载缓存和模型继续被 Git 忽略，
  无需把约 60 MB 的模型提交仓库，也无需 API Key 或自备签名证书。
- 模型保存到 `android/app/src/main/assets/models/ggml-base-q5_1.bin`，
  与原生插件读取的 `models/ggml-base-q5_1.bin` 一致，随 APK 安装，不在手机首次启动时下载。

Linux 构建使用 `-Dorg.gradle.java.home=$JAVA_HOME` 覆盖本机 Windows JDK 路径，
不修改已提交的 `android/gradle.properties`，也不修改系统或全局配置。
Gradle 限制为两个 worker，并设置 CMake 并行度为 2 以控制内存。APK 上传前检查 ZIP 完整性、内置模型 SHA-256，
并检查 `arm64-v8a`、`x86_64` 下的 `libvoice_whisper.so` 均存在；任何检查失败都不上传。
这些是打包检查，不会运行手机录音或推理，也不替代前文的真机验收。

### 触发与查看进度

1. 将本次本地提交推送到 GitHub 的 `main` 分支，例如在确认远端正确后运行
   `git push origin main`。仅本地 commit 不会触发；以后每次向 `main` push 都自动构建。
2. 手动构建：在 GitHub 仓库打开 **Actions > Android Debug APK > Run workflow**，
   选择 `main` 后点击 **Run workflow**。工作流首次出现在默认分支后才有手动入口。
3. 若仓库尚未启用 Actions，在 **Settings > Actions > General** 开启并允许工作流使用的
   Actions；组织策略可能需要管理员放行。无需配置 Release 密钥或模型下载密钥。
4. 在 **Actions** 打开对应提交的运行记录，进入 **Build offline Whisper APK** 查看各步骤日志。
   首次需要下载工具链、Gradle、Maven 依赖与模型，耗时以实际日志为准。
5. 失败时查看第一个红色步骤；模型校验、下载超时、原生编译失败等均应先排查日志，
   不跳过校验、不删除原生插件、不把旧 APK 当作本次结果。临时网络失败可用 **Re-run jobs** 重试。

GitHub 托管运行器的构建时间、缓存和产物存储受账号、仓库可见性及套餐额度限制，
不是承诺无限免费。源码及公开模型在云端构建，手机录音不会参与构建或上传。

### 下载与手机安装

1. 等本次运行显示绿色成功，打开运行记录的 **Summary**。
2. 在底部 **Artifacts** 点击 **voice-account-debug-apk**，登录 GitHub 后下载 ZIP。
   解压得到 `app-debug.apk`；不要将产物 ZIP 直接当作安装包。
3. 云端原始输出位置为 `android/app/build/outputs/apk/debug/app-debug.apk`，
   不是本机已经生成同路径文件；电脑下载位置以浏览器实际保存位置为准。
   构建日志最后的 APK SHA-256 可用于核对下载文件。30 天后产物过期，需重新构建或提前自行保存。
4. 把 APK 传到安卓手机并用文件管理器打开，按系统提示允许该来源“安装未知应用”。
   支持 Android 7.0 / API 24 以上的 `arm64-v8a` 设备及 `x86_64` 模拟器，不支持仅 32 位设备。
5. 首次授权麦克风后，开启飞行模式、关闭 Wi-Fi，验证中文录音、填单和用户确认后入账，
   同时检查手动记账、统计、预算和导出文件实际可用。无需启动电脑后端或处于同一网络。

### Debug 覆盖更新注意

云端临时运行器使用自动生成的默认 Debug 证书，不上传、不缓存或另行配置签名密钥。
**不同运行的 Debug 证书可能不同**，也可能与本机或 VoltBuilder 的证书不同，
相同包名并不保证能覆盖安装。遇到签名冲突不要直接卸载，先导出并核对账单备份；
卸载或清除应用数据会删除本地数据。当前备份只含账单、不含预算，且尚无导入恢复功能。
长期稳定更新需要另行规划版本号及持久签名，本工作流只用于 Debug 测试，不用于商店发布。

### 本次本地校验记录（2026-11-13）

- `actionlint 1.7.12`、YAML 解析和所有 Bash 步骤语法检查通过，五个 Action 的固定提交均可获取。
- 原有单元测试 `94/94`、云端权限配置测试 `3/3` 通过；`cap sync android` 成功，
  `www/` 与安卓网页资源的 19 个文件 SHA-256 一致。
- 在合成 ZIP 上运行工作流中相同的 APK 检查：完整资源通过，缺模型、模型哈希错误、
  缺 arm64 库、缺 x86_64 库均被拦截，共 `5/5`。合成 ZIP 不是编译出的 APK。
- 干净目录中的 Whisper 源码下载、哈希校验与解压成功；本机访问 Hugging Face 下载模型超时，
  因此未完成干净模型重新下载。本机此前准备的模型 SHA-256 与源码版本离线校验通过，
  云端下载仍须以首次 Actions 日志为准，不改用不明镜像或跳过校验。
- 本机没有下载 SDK / NDK、执行安卓编译或触发远端 Actions；尚未生成本次 APK，也未做真机验收。
