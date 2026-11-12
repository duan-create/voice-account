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
An APK build additionally requires Android Studio, Android SDK 36 and JDK 21,
with valid `ANDROID_HOME` and `JAVA_HOME` paths. The minimum Android API is 24.
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

## Android Debug 构建指南

只构建用于真机测试的 Debug APK，不配置 Release 签名或商店发布。

### 本机环境检查结果（2026-11-12）

| 检查项 | 结果 |
| --- | --- |
| JDK 21 | `C:\Users\Lenovo\.jdks\ms-21.0.12.1` 的 `java` 和 `javac` 均返回 `21.0.12.1`，可用 |
| 当前 `JAVA_HOME` | 指向 JDK 25 的路径开头带不可见字符 `U+202A`，路径无效，不能直接用于构建 |
| Android SDK | `ANDROID_HOME`、`ANDROID_SDK_ROOT` 未设置，项目无 `android/local.properties`；默认目录及检查的常见目录未找到 SDK |
| Build-Tools / ADB / SDK Manager | 未找到可用 SDK 组件，相关命令不在 PATH 中 |
| Debug APK | 未生成；环境检查未通过，因此未执行 Gradle 构建 |

工程使用 Capacitor 8.6.0、Gradle Wrapper 8.14.3、Android Gradle Plugin
8.13.0、Java 21、`compileSdkVersion = 36`、`targetSdkVersion = 36`。
虽然任务要求 SDK 34+，此工程实际必须安装 **Android SDK Platform 36**，
不能仅安装 API 34/35，也无需为此降低工程版本。最低运行系统为 Android 7.0（API 24）。

### 配置缺失环境

1. 安装 Android Studio，在 SDK Manager 中确认 SDK Location。默认位置为
   `C:\Users\Lenovo\AppData\Local\Android\Sdk`，也可使用自己的安装路径。
2. 在 SDK Platforms 中安装 Android 16 / API 36；在 SDK Tools 中勾选
   Android SDK Platform-Tools、Android SDK Command-line Tools (latest)，
   打开 Show Package Details，安装 Android SDK Build-Tools 36.0.0。
   仅构建 APK 和连接真机不需要安装模拟器系统镜像。
3. 使用已验证的 JDK 21。下列 PowerShell 配置只影响当前终端，不修改用户或系统设置。
   `JAVA_HOME` 指向 JDK 根目录而不是 `bin`，不要沿用带不可见字符的旧值。
   若 SDK 安装在其他位置，修改 `ANDROID_HOME` 一行。

```powershell
$env:JAVA_HOME = 'C:\Users\Lenovo\.jdks\ms-21.0.12.1'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:PATH"
```

4. 在同一终端验证 Java 和 SDK。以下 SDK 文件必须存在，SDK Manager 的已安装列表
   应包含 `platforms;android-36`、`build-tools;36.0.0` 和 `platform-tools`。
   如果缺失，返回 SDK Manager 安装，不继续构建。运行许可证命令后阅读并确认所需协议。

```powershell
java -version
javac -version
Test-Path -LiteralPath "$env:ANDROID_HOME\platforms\android-36\android.jar"
Test-Path -LiteralPath "$env:ANDROID_HOME\build-tools\36.0.0\aapt2.exe"
Test-Path -LiteralPath "$env:ANDROID_HOME\build-tools\36.0.0\apksigner.bat"
Test-Path -LiteralPath "$env:ANDROID_HOME\platform-tools\adb.exe"
& "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat" --list_installed
& "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat" --licenses
```

Android Studio 内构建时，也要在 Settings > Build, Execution, Deployment >
Build Tools > Gradle 中将 Gradle JDK 设为同一个 JDK 21。SDK 路径可由
`ANDROID_HOME` 提供；Android Studio 生成的 `android/local.properties` 已被 Git 忽略。

### 构建 Debug APK

环境验证通过后，在同一 PowerShell 终端逐条运行。任一命令失败即停止排查，
不要继续将旧的 APK 当作本次构建结果。首次运行需要联网下载 Gradle 和 Maven 依赖。
若 Windows 上 Gradle 提示工程路径含非 ASCII 字符，将仓库克隆到如
`D:\voice-account` 的纯英文目录，并相应替换下列路径，不通过关闭路径检查来强行构建。

```powershell
Set-Location -LiteralPath 'D:\app开发'
npm.cmd ci
npx.cmd cap sync android
Set-Location -LiteralPath 'D:\app开发\android'
.\gradlew.bat --version
.\gradlew.bat assembleDebug --stacktrace
```

`--version` 应显示 Gradle 8.14.3 和 Java/JVM 21；`assembleDebug` 必须退出码为 0，
且输出 `BUILD SUCCESSFUL`。Debug 使用工具链自动管理的调试密钥，不需要提供 Release
密钥或签名配置。成功后检查 APK 的时间、大小及哈希：

```powershell
Get-Item -LiteralPath 'D:\app开发\android\app\build\outputs\apk\debug\app-debug.apk' |
  Select-Object FullName, Length, LastWriteTime
Get-FileHash -LiteralPath 'D:\app开发\android\app\build\outputs\apk\debug\app-debug.apk' -Algorithm SHA256
```

**预期输出路径（本次尚未生成）：**
`D:\app开发\android\app\build\outputs\apk\debug\app-debug.apk`

### 安装到安卓手机

1. USB 安装：手机开启开发者选项和 USB 调试，连接电脑并在手机上确认调试授权。
   在已配置的终端运行下列命令；`adb devices` 应显示设备状态为 `device`，不是
   `unauthorized`。多个设备连接时，使用 `adb -s <设备序列号> install -r <APK路径>`。
2. 文件安装：将成功构建的 APK 传到手机，用文件管理器打开；按系统提示允许该来源安装
   应用，安装后可关闭此权限。此 Debug APK 仅供测试，不用于商店发布。

```powershell
adb devices
adb install -r 'D:\app开发\android\app\build\outputs\apk\debug\app-debug.apk'
```

`-r` 用于保留数据覆盖安装，但要求包名和签名兼容。若提示签名不一致，不要直接卸载：
卸载会删除本地账单，应先确认数据备份。启动应用后还需真机验证手动记账、离线、语音和导出，
构建成功不等于这些 WebView 能力已经通过测试。

### 本地文件与版本管理

`android/**/build/`、`android/.gradle/`、`android/local.properties`、`www/`、
`node_modules/`、APK/AAB 和签名文件均已被忽略。构建产物和临时文件留在本地，
本次只提交构建说明，不提交安装包、SDK、缓存或调试密钥，也不执行 Release 构建。
