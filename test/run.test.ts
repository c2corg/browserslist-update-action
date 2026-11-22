import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@actions/core', () => ({
  info: vi.fn(),
  warning: vi.fn(),
  setOutput: vi.fn(),
  setSecret: vi.fn(),
}));
vi.mock('@actions/exec', () => ({ getExecOutput: vi.fn() }));

const core = await import('@actions/core');
const { getExecOutput } = await import('@actions/exec');
const { run } = await import('../src/run.js');
type Inputs = import('../src/run.js').Inputs;
const { asOctokit, fakeOctokit, httpError } = await import('./fake-octokit.js');

const repository = { owner: 'c2corg', repo: 'c2c_ui', serverUrl: 'https://github.com' };
const token = 'ghs_secret';
const basicAuth = Buffer.from(`x-access-token:${token}`).toString('base64');

let dir: string;
let calls: string[][];
let gitStatus: string;
let hasName: boolean;
let hasEmail: boolean;

const inputs = (overrides: Partial<Inputs> = {}): Inputs => ({
  token,
  branch: 'browserslist-update',
  baseBranch: 'master',
  directory: dir,
  commitMessage: 'Update caniuse database',
  title: '📈 Update caniuse database',
  body: '',
  labels: [],
  reviewers: [],
  teams: [],
  ...overrides,
});

const ok = (stdout = '', exitCode = 0) => Promise.resolve({ stdout, stderr: '', exitCode });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'browserslist-update-'));
  writeFileSync(join(dir, 'package-lock.json'), '{}');
  calls = [];
  gitStatus = ' M package-lock.json\n';
  hasName = true;
  hasEmail = true;
  vi.mocked(getExecOutput).mockImplementation((command, args = []) => {
    calls.push([command, ...args]);
    if (command !== 'git') {
      return ok('Installed version:       1.0.30001820\nTarget browser changes:\n+ safari 26.2\n');
    }
    if (args[0] === 'rev-parse') {
      return ok('master\n');
    }
    if (args[0] === 'status') {
      return ok(gitStatus);
    }
    if (args[0] === 'config') {
      const configured = args[1] === 'user.name' ? hasName : hasEmail;
      return ok(configured ? 'value\n' : '', configured ? 0 : 1);
    }
    return ok();
  });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.clearAllMocks();
});

const gitCalls = (): string[] => calls.filter(([command]) => command === 'git').map((call) => call.join(' '));

describe('run', () => {
  it('creates a pull request from the base branch when there are changes', async () => {
    const octokit = fakeOctokit();
    await run(inputs({ labels: ['chore', 'dependencies', 'missing'] }), asOctokit(octokit), repository);

    expect(calls).toContainEqual(['npx', 'update-browserslist-db@latest']);
    expect(vi.mocked(getExecOutput).mock.calls.find(([command]) => command === 'npx')?.[2]).toEqual({ cwd: dir });
    expect(gitCalls()).toEqual([
      'git rev-parse --abbrev-ref HEAD',
      'git fetch --no-tags origin master',
      'git checkout -B browserslist-update FETCH_HEAD',
      `git status --porcelain --untracked-files=no -- ${dir}`,
      `git add --update -- ${dir}`,
      'git config user.name',
      'git config user.email',
      `git commit --message Update caniuse database -- ${dir}`,
      `git -c http.https://github.com/.extraheader= -c http.https://github.com/.extraheader=AUTHORIZATION: basic ${basicAuth} push --force origin HEAD:refs/heads/browserslist-update`,
      'git checkout master',
    ]);
    expect(core.setSecret).toHaveBeenCalledWith(basicAuth);
    expect(octokit.rest.repos.get).not.toHaveBeenCalled();
    expect(octokit.rest.pulls.list).not.toHaveBeenCalled();
    expect(octokit.rest.pulls.create).toHaveBeenCalledWith({
      owner: 'c2corg',
      repo: 'c2c_ui',
      title: '📈 Update caniuse database',
      body: expect.stringContaining('```diff\n+ safari 26.2\n```'),
      base: 'master',
      head: 'browserslist-update',
    });
    expect(octokit.rest.issues.addLabels).toHaveBeenCalledWith({
      owner: 'c2corg',
      repo: 'c2c_ui',
      issue_number: 42,
      labels: ['chore', 'Dependencies'],
    });
    expect(core.warning).toHaveBeenCalledWith('Label missing not found in repository, ignored');
    expect(octokit.rest.pulls.requestReviewers).not.toHaveBeenCalled();
    expect(core.setOutput).toHaveBeenCalledWith('has_pr', true);
    expect(core.setOutput).toHaveBeenCalledWith('pr_status', 'created');
    expect(core.setOutput).toHaveBeenCalledWith('pr_number', 42);
  });

  it('updates the existing pull request', async () => {
    const octokit = fakeOctokit({ branchExists: true, openPr: true });
    await run(inputs({ body: 'Custom body' }), asOctokit(octokit), repository);

    expect(octokit.rest.pulls.list).toHaveBeenCalledWith({
      owner: 'c2corg',
      repo: 'c2c_ui',
      head: 'c2corg:browserslist-update',
      state: 'open',
      per_page: 1,
    });
    expect(octokit.rest.git.deleteRef).not.toHaveBeenCalled();
    expect(octokit.rest.pulls.create).not.toHaveBeenCalled();
    expect(octokit.rest.pulls.update).toHaveBeenCalledWith({
      owner: 'c2corg',
      repo: 'c2c_ui',
      pull_number: 12,
      body: 'Custom body',
      base: 'master',
    });
    expect(core.setOutput).toHaveBeenCalledWith('pr_status', 'updated');
    expect(core.setOutput).toHaveBeenCalledWith('pr_number', 12);
  });

  it('deletes a leftover branch without pull request before creating a new one', async () => {
    const octokit = fakeOctokit({ branchExists: true });
    await run(inputs(), asOctokit(octokit), repository);

    expect(octokit.rest.git.deleteRef).toHaveBeenCalledWith({
      owner: 'c2corg',
      repo: 'c2c_ui',
      ref: 'heads/browserslist-update',
    });
    expect(octokit.rest.pulls.create).toHaveBeenCalled();
  });

  it('stops without pull request when nothing changed', async () => {
    gitStatus = '';
    const octokit = fakeOctokit();
    await run(inputs(), asOctokit(octokit), repository);

    expect(core.setOutput).toHaveBeenCalledWith('has_pr', false);
    expect(gitCalls().some((call) => call.includes(' push '))).toBe(false);
    expect(gitCalls().at(-1)).toBe('git checkout master');
    expect(octokit.rest.pulls.create).not.toHaveBeenCalled();
  });

  it('targets the repository default branch when no base branch is given', async () => {
    const octokit = fakeOctokit();
    await run(inputs({ baseBranch: '' }), asOctokit(octokit), repository);

    expect(octokit.rest.repos.get).toHaveBeenCalledWith({ owner: 'c2corg', repo: 'c2c_ui' });
    expect(gitCalls()).toContain('git fetch --no-tags origin main');
    expect(octokit.rest.pulls.create).toHaveBeenCalledWith(expect.objectContaining({ base: 'main' }));
  });

  it('commits as github-actions[bot] when git has no identity', async () => {
    hasName = false;
    hasEmail = false;
    await run(inputs(), asOctokit(fakeOctokit()), repository);

    expect(gitCalls()).toContain(
      `git -c user.name=github-actions[bot] -c user.email=41898282+github-actions[bot]@users.noreply.github.com commit --message Update caniuse database -- ${dir}`,
    );
  });

  it('completes a partial git identity', async () => {
    hasEmail = false;
    await run(inputs(), asOctokit(fakeOctokit()), repository);

    expect(gitCalls()).toContain(
      `git -c user.email=41898282+github-actions[bot]@users.noreply.github.com commit --message Update caniuse database -- ${dir}`,
    );
  });

  it('requests reviews from users and teams, resolving team names to slugs', async () => {
    const octokit = fakeOctokit();
    await run(inputs({ reviewers: ['user1'], teams: ['Front Team', 'back-team'] }), asOctokit(octokit), repository);

    expect(octokit.rest.pulls.requestReviewers).toHaveBeenCalledWith({
      owner: 'c2corg',
      repo: 'c2c_ui',
      pull_number: 42,
      reviewers: ['user1'],
      team_reviewers: ['front-team', 'back-team'],
    });
  });

  it('keeps team names as given when teams cannot be listed', async () => {
    const octokit = fakeOctokit();
    octokit.paginate.mockRejectedValue(httpError(404));
    await run(inputs({ teams: ['team1'] }), asOctokit(octokit), repository);

    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Unable to list organization teams'));
    expect(octokit.rest.pulls.requestReviewers).toHaveBeenCalledWith(
      expect.objectContaining({ reviewers: [], team_reviewers: ['team1'] }),
    );
  });

  it('uses the package manager detected in the directory', async () => {
    rmSync(join(dir, 'package-lock.json'));
    writeFileSync(join(dir, 'pnpm-lock.yaml'), '');
    await run(inputs(), asOctokit(fakeOctokit()), repository);

    expect(calls).toContainEqual(['pnpm', 'dlx', 'update-browserslist-db@latest']);
  });

  it('fails when no package manager is detected', async () => {
    rmSync(join(dir, 'package-lock.json'));
    const empty = mkdtempSync(join(tmpdir(), 'browserslist-update-empty-'));
    try {
      await expect(run(inputs({ directory: empty }), asOctokit(fakeOctokit()), repository)).rejects.toThrow(
        'Could not detect package manager',
      );
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
    expect(gitCalls().at(-1)).toBe('git checkout master');
  });

  it('propagates unexpected API errors', async () => {
    const octokit = fakeOctokit();
    octokit.rest.git.getRef.mockRejectedValue(httpError(500));
    await expect(run(inputs(), asOctokit(octokit), repository)).rejects.toThrow('HTTP 500');
  });
});
