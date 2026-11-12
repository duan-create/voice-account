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
