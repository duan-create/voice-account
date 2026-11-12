const { cp, copyFile, mkdir, rm } = require("node:fs/promises");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");
const webDir = join(root, "www");

async function prepareWeb() {
  // Keep the allowlist explicit: never copy .git, node_modules or android into the app.
  await rm(webDir, { recursive: true, force: true });
  await mkdir(webDir, { recursive: true });
  for (const file of ["capacitor.js", "capacitor.js.map"]) {
    await copyFile(join(root, "node_modules/@capacitor/core/dist", file), join(root, file));
    await copyFile(join(root, file), join(webDir, file));
  }
  for (const asset of ["index.html", "css", "js", "manifest.json", "sw.js"]) {
    await cp(join(root, asset), join(webDir, asset), { recursive: true });
  }
  console.info("Web assets prepared in www/ (no compilation required).");
}

prepareWeb().catch((error) => {
  console.error("Web asset preparation failed:", error);
  process.exitCode = 1;
});
