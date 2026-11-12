const { readFile, writeFile } = require("node:fs/promises");
const { join } = require("node:path");
const { createRequire } = require("node:module");

async function configureAndroid() {
  if (process.env.CAPACITOR_PLATFORM_NAME !== "android") return;
  // Resolve the XML parser shipped with the pinned Capacitor CLI.
  const cliRequire = createRequire(require.resolve("@capacitor/cli/package.json"));
  const { parseStringPromise, Builder } = cliRequire("xml2js");
  const root = process.env.CAPACITOR_ROOT_DIR || process.cwd();
  const file = join(root, "android/app/src/main/AndroidManifest.xml");
  const document = await parseStringPromise(await readFile(file, "utf8"));
  const manifest = document.manifest;
  const permissions = manifest["uses-permission"] ||= [];
  for (const name of ["INTERNET", "RECORD_AUDIO", "MODIFY_AUDIO_SETTINGS"]) {
    const fullName = `android.permission.${name}`;
    if (!permissions.some((entry) => entry.$["android:name"] === fullName)) {
      permissions.push({ $: { "android:name": fullName } });
    }
  }
  const features = manifest["uses-feature"] ||= [];
  let microphone = features.find((entry) => entry.$["android:name"] === "android.hardware.microphone");
  if (!microphone) {
    microphone = { $: { "android:name": "android.hardware.microphone" } };
    features.push(microphone);
  }
  microphone.$["android:required"] = "false";
  await writeFile(file, new Builder().buildObject(document) + "\n");
  console.info("Cloud Android manifest configured: network, audio, optional microphone.");
}

configureAndroid().catch((error) => {
  console.error("Cloud Android configuration failed:", error);
  process.exitCode = 1;
});
