# Voice Account PWA / Android Shell

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
