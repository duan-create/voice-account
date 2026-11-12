const assert = require("node:assert/strict");
const { test } = require("node:test");
const { mkdtemp, mkdir, readFile, writeFile, rm } = require("node:fs/promises");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { spawnSync } = require("node:child_process");
const { createRequire } = require("node:module");
const cliRequire = createRequire(require.resolve("@capacitor/cli/package.json"));
const { parseStringPromise } = cliRequire("xml2js");
const script = join(__dirname, "../scripts/configure-cloud-android.cjs");

test("cloud hooks restore audio permissions on a generated Android project without duplicates", async () => {
  const root = await mkdtemp(join(tmpdir(), "voice-cloud-permissions-"));
  const file = join(root, "android/app/src/main/AndroidManifest.xml");
  try {
    await mkdir(join(root, "android/app/src/main"), { recursive: true });
    await writeFile(file, '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:label="test"/><uses-permission android:name="android.permission.INTERNET"/></manifest>');
    for (let run = 0; run < 2; run++) {
      const result = spawnSync(process.execPath, [script], {
        env: { ...process.env, CAPACITOR_ROOT_DIR: root, CAPACITOR_PLATFORM_NAME: "android" },
        encoding: "utf8"
      });
      assert.equal(result.status, 0, result.stderr);
    }
    const { manifest } = await parseStringPromise(await readFile(file, "utf8"));
    assert.deepEqual(manifest["uses-permission"].map((entry) => entry.$["android:name"]).sort(), [
      "android.permission.INTERNET", "android.permission.MODIFY_AUDIO_SETTINGS", "android.permission.RECORD_AUDIO"
    ]);
    assert.deepEqual(manifest["uses-feature"].map((entry) => entry.$), [
      { "android:name": "android.hardware.microphone", "android:required": "false" }
    ]);
    assert.equal(manifest.application[0].$["android:label"], "test");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cloud Android hook does not touch other platforms", () => {
  const result = spawnSync(process.execPath, [script], {
    env: { ...process.env, CAPACITOR_PLATFORM_NAME: "web" }, encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
});

test("cloud Android hook fails clearly if the generated manifest is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "voice-cloud-missing-"));
  try {
    const result = spawnSync(process.execPath, [script], {
      env: { ...process.env, CAPACITOR_ROOT_DIR: root, CAPACITOR_PLATFORM_NAME: "android" }, encoding: "utf8"
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Cloud Android configuration failed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
