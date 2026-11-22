// Runs the action with real git and npm against a local bare repository. Needs network access to the npm registry.
// Opt-in: INTEGRATION=1 npm test
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@actions/core', () => ({
  info: vi.fn(),
  warning: vi.fn(),
  setOutput: vi.fn(),
  setSecret: vi.fn(),
}));

const core = await import('@actions/core');
const { run } = await import('../src/run.js');
const { asOctokit, fakeOctokit } = await import('./fake-octokit.js');

const OLD_CANIUSE = {
  version: '1.0.30001700',
  resolved: 'https://registry.npmjs.org/caniuse-lite/-/caniuse-lite-1.0.30001700.tgz',
  integrity: 'sha512-2S6XIXwaE7K7erT8dY+kLQcpa5ms63XlRkMkReXjle+kf6c5g38vyMl+Z5y8dSxOFDhcFe+nxnn261PLxBSQsQ==',
};

describe.runIf(process.env['INTEGRATION'])('integration', () => {
  let root: string;
  let work: string;
  let origin: string;
  const startDir = process.cwd();
  const git = (...args: string[]): string => execFileSync('git', args, { cwd: work, encoding: 'utf8' }).trim();

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'browserslist-update-it-'));
    origin = join(root, 'origin.git');
    work = join(root, 'work');
    execFileSync('git', ['init', '--quiet', '--bare', '--initial-branch=master', origin]);
    execFileSync('git', ['clone', '--quiet', origin, work]);
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.com');
    writeFileSync(
      join(work, 'package.json'),
      JSON.stringify({ name: 'fixture', private: true, dependencies: { browserslist: '4.24.0' } }, null, 2) + '\n',
    );
    execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd: work,
    });
    // pretend an old caniuse-lite is locked
    const lockFile = join(work, 'package-lock.json');
    const lock = JSON.parse(readFileSync(lockFile, 'utf8'));
    Object.assign(lock.packages['node_modules/caniuse-lite'], OLD_CANIUSE);
    writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n');
    git('add', '.');
    git('commit', '--quiet', '-m', 'init');
    git('push', '--quiet', 'origin', 'master');
    process.chdir(work);
  }, 120_000);

  afterAll(() => {
    process.chdir(startDir);
    rmSync(root, { recursive: true, force: true });
  });

  it('pushes an updated lockfile and creates a pull request', async () => {
    const octokit = fakeOctokit();
    await run(
      {
        token: 'ghs_secret',
        branch: 'browserslist-update',
        baseBranch: 'master',
        directory: '.',
        commitMessage: 'build: update caniuse database',
        title: 'Update caniuse database',
        body: '',
        labels: [],
        reviewers: [],
        teams: [],
      },
      asOctokit(octokit),
      { owner: 'c2corg', repo: 'fixture', serverUrl: 'https://github.com' },
    );

    expect(git('rev-parse', '--abbrev-ref', 'HEAD')).toBe('master');
    expect(git('--git-dir', origin, 'log', '-1', '--format=%s', 'browserslist-update')).toBe(
      'build: update caniuse database',
    );
    expect(git('--git-dir', origin, 'diff', '--name-only', 'master', 'browserslist-update')).toBe('package-lock.json');
    const pushedLock = JSON.parse(git('--git-dir', origin, 'show', 'browserslist-update:package-lock.json'));
    expect(pushedLock.packages['node_modules/caniuse-lite'].version).not.toBe(OLD_CANIUSE.version);
    expect(core.setOutput).toHaveBeenCalledWith('has_pr', true);
    expect(octokit.rest.pulls.create).toHaveBeenCalledWith(
      expect.objectContaining({
        base: 'master',
        head: 'browserslist-update',
        body: expect.stringContaining(`Installed version: ${OLD_CANIUSE.version}`),
      }),
    );
  }, 120_000);
});
