const assert = require("node:assert/strict");
const { test } = require("node:test");
const { spawnSync } = require("node:child_process");
const { readFile, readdir, writeFile, mkdir } = require("node:fs/promises");
const { join } = require("node:path");

const root = join(__dirname, "..");

test("web preparation copies only app assets and the official runtime, replacing stale files", async () => {
  const webDir = join(root, "www");
  await mkdir(webDir, { recursive: true });
  await writeFile(join(webDir, "stale.txt"), "old generated asset");
  const result = spawnSync(process.execPath, ["scripts/prepare-web.cjs"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual((await readdir(webDir)).sort(), ["capacitor.js", "capacitor.js.map", "css", "index.html", "js", "manifest.json", "sw.js"]);
  const assets = ["index.html", "manifest.json", "sw.js", "css/style.css", "js/app.js", "js/ui.js", "js/db.js", "js/db.selftest.js", "js/budget-db.js", "js/finance.js", "js/finance-ui.js", "js/charts.js", "js/voice.js", "js/native-voice.js", "js/voice-parser.js", "js/vendor/nzh-cn.js", "js/vendor/nzh-LICENSE.txt"];
  for (const asset of assets) {
    assert.deepEqual(await readFile(join(webDir, asset)), await readFile(join(root, asset)), `${asset} must stay unchanged`);
  }
  for (const name of ['ledger', 'ledger-api', 'categories', 'assets-ui', 'calendar', 'calendar-ui', 'backup', 'backup-ui', 'plans', 'plans-ui', 'voice-category']) {
    assert.deepEqual(await readFile(join(webDir, `js/${name}.js`)), await readFile(join(root, `js/${name}.js`)));
    assert.ok((await readFile(join(webDir, 'sw.js'), 'utf8')).includes(`./js/${name}.js`));
  }
  for (const name of ['papaparse', 'exceljs']) for (const suffix of ['.min.js', '-LICENSE.txt']) assert.ok((await readFile(join(webDir, `js/vendor/${name}${suffix}`))).length > 0);
  for (const filename of ["capacitor.js", "capacitor.js.map"]) {
    const runtime = await readFile(join(root, "node_modules/@capacitor/core/dist", filename));
    assert.deepEqual(await readFile(join(root, filename)), runtime);
    assert.deepEqual(await readFile(join(webDir, filename)), runtime);
  }
});
