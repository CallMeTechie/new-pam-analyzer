import { execFileSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';

// The Android platform module imports Tauri APIs; only the pure helper is under test.
vi.mock('@tauri-apps/api/core', () => ({ addPluginListener: vi.fn(), Channel: class {}, invoke: vi.fn() }));
vi.mock('@tauri-apps/api/path', () => ({ appConfigDir: vi.fn() }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));
vi.mock('@tauri-apps/plugin-sql', () => ({ default: class {} }));

const { versionFromCode } = await import('../src/platform/android');

describe('versionFromCode', () => {
  it('reverses the versionCode of the release workflow', () => {
    for (const v of ['0.4.0-beta.2', '0.4.0', '1.12.3-beta.7', '2.0.15']) {
      const code = Number(
        execFileSync('node', ['.github/scripts/app-release.mjs', 'version-code', v], { cwd: '../..' }).toString(),
      );
      expect(versionFromCode(code)).toBe(v);
    }
  });
});
