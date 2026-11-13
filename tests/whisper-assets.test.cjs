const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtemp, mkdir, copyFile, writeFile, rm } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');

test('Whisper preparation refuses missing or corrupted model without attempting a build', async () => {
  const root = await mkdtemp(join(tmpdir(), 'voice-model-'));
  try {
    await mkdir(join(root, 'scripts'));
    await copyFile(join(__dirname, '../scripts/prepare-android-whisper.ps1'), join(root, 'scripts/prepare-android-whisper.ps1'));
    for (const corrupt of [false, true]) {
      if (corrupt) {
        await mkdir(join(root, 'android/app/src/main/assets/models'), { recursive: true });
        await writeFile(join(root, 'android/app/src/main/assets/models/ggml-tiny-q5_1.bin'), 'not a Whisper model');
      }
      const result = spawnSync('pwsh', ['-NoProfile', '-File', join(root, 'scripts/prepare-android-whisper.ps1'), '-VerifyOnly'], { encoding: 'utf8' });
      assert.ifError(result.error);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Model missing or checksum mismatch/);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
