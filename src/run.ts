import * as core from '@actions/core';
import { getExecOutput, type ExecOutput } from '@actions/exec';
import type { getOctokit } from '@actions/github';
import { detect, resolveCommand } from 'package-manager-detector';
import { resolve } from 'node:path';
import { prBody } from './parse-browserslist-output.js';

export type Octokit = ReturnType<typeof getOctokit>;

export type Inputs = {
  token: string;
  branch: string;
  /** Empty string means the repository default branch. */
  baseBranch: string;
  directory: string;
  commitMessage: string;
  title: string;
  /** Empty string means a body generated from the update output. */
  body: string;
  labels: string[];
  reviewers: string[];
  teams: string[];
};

export type Repository = {
  owner: string;
  repo: string;
  /** e.g. https://github.com */
  serverUrl: string;
};

const BOT_NAME = 'github-actions[bot]';
const BOT_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com';

const git = (args: string[], options: { ignoreReturnCode?: boolean; silent?: boolean } = {}): Promise<ExecOutput> =>
  getExecOutput('git', args, options);

const isNotFound = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'status' in error && error.status === 404;

export async function run(inputs: Inputs, octokit: Octokit, { owner, repo, serverUrl }: Repository): Promise<void> {
  const { branch } = inputs;

  const baseBranch = inputs.baseBranch || (await octokit.rest.repos.get({ owner, repo })).data.default_branch;
  core.info(`Pull request branch: ${branch}, base branch: ${baseBranch}`);

  core.info('Check whether a branch and a matching pull request already exist');
  const branchExists = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${branch}` }).then(
    () => true,
    (error: unknown) => {
      if (isNotFound(error)) {
        return false;
      }
      throw error;
    },
  );
  const existingPr = branchExists
    ? (await octokit.rest.pulls.list({ owner, repo, head: `${owner}:${branch}`, state: 'open', per_page: 1 })).data[0]
    : undefined;
  if (branchExists && !existingPr) {
    // should have been deleted when the previous pull request was merged
    core.info(`Branch ${branch} exists without an open pull request, delete it first`);
    await octokit.rest.git.deleteRef({ owner, repo, ref: `heads/${branch}` });
  }

  // keep track of current ref, to restore it at the end
  let startRef = (await git(['rev-parse', '--abbrev-ref', 'HEAD'], { silent: true })).stdout.trim();
  if (startRef === 'HEAD') {
    startRef = (await git(['rev-parse', 'HEAD'], { silent: true })).stdout.trim();
  }

  try {
    // always start from the up-to-date base branch, the pull request branch is owned by this action
    core.info(`Create branch ${branch} from origin/${baseBranch}`);
    await git(['fetch', '--no-tags', 'origin', baseBranch]);
    await git(['checkout', '-B', branch, 'FETCH_HEAD']);

    const directory = resolve(inputs.directory || '.');
    const pm = await detect({ cwd: directory });
    if (!pm) {
      throw new Error(`Could not detect package manager in ${directory}`);
    }
    const command = resolveCommand(pm.agent, 'execute', ['update-browserslist-db@latest']);
    if (!command) {
      throw new Error(`Package manager ${pm.agent} cannot execute packages`);
    }
    core.info(`Run update-browserslist-db with ${pm.agent} in ${directory}`);
    const { stdout: updateOutput } = await getExecOutput(command.command, command.args, { cwd: directory });

    // only consider tracked files (lockfiles), never commit files created by the install (e.g. node_modules)
    core.info('Check whether the update brings changes');
    const { stdout: status } = await git(['status', '--porcelain', '--untracked-files=no', '--', directory]);
    if (!status.trim()) {
      core.setOutput('has_pr', false);
      core.info('No changes. Exiting');
      return;
    }
    core.setOutput('has_pr', true);

    core.info('Commit changes');
    await git(['add', '--update', '--', directory]);
    const hasConfig = async (key: string): Promise<boolean> =>
      (await git(['config', key], { ignoreReturnCode: true, silent: true })).exitCode === 0;
    const identity = [
      ...((await hasConfig('user.name')) ? [] : ['-c', `user.name=${BOT_NAME}`]),
      ...((await hasConfig('user.email')) ? [] : ['-c', `user.email=${BOT_EMAIL}`]),
    ];
    // pathspec: never commit changes staged outside of the directory by earlier steps
    await git([...identity, 'commit', '--message', inputs.commitMessage, '--', directory]);

    core.info(`Push branch ${branch}`);
    const basicAuth = Buffer.from(`x-access-token:${inputs.token}`).toString('base64');
    core.setSecret(basicAuth);
    const extraHeader = `http.${serverUrl}/.extraheader`;
    await git([
      // an empty value resets headers set by actions/checkout, so that the given token is used
      '-c',
      `${extraHeader}=`,
      '-c',
      `${extraHeader}=AUTHORIZATION: basic ${basicAuth}`,
      'push',
      '--force',
      'origin',
      `HEAD:refs/heads/${branch}`,
    ]);

    const body = inputs.body || prBody(updateOutput);
    let pr: { number: number; node_id: string };
    if (existingPr) {
      core.info(`Update pull request #${existingPr.number}`);
      pr = (await octokit.rest.pulls.update({ owner, repo, pull_number: existingPr.number, body, base: baseBranch }))
        .data;
      core.setOutput('pr_status', 'updated');
    } else {
      core.info(`Create pull request for branch ${branch}`);
      pr = (await octokit.rest.pulls.create({ owner, repo, title: inputs.title, body, base: baseBranch, head: branch }))
        .data;
      core.setOutput('pr_status', 'created');
    }
    core.setOutput('pr_number', pr.number);

    await addLabels(octokit, { owner, repo }, pr.number, inputs.labels);
    await addReviewers(octokit, { owner, repo }, pr.number, inputs.reviewers, inputs.teams);
  } finally {
    await git(['checkout', startRef], { ignoreReturnCode: true });
  }
}

async function addLabels(
  octokit: Octokit,
  { owner, repo }: Pick<Repository, 'owner' | 'repo'>,
  issueNumber: number,
  labels: string[],
): Promise<void> {
  if (!labels.length) {
    return;
  }
  // only apply existing labels, never create missing ones
  const existing = new Map(
    (await octokit.paginate(octokit.rest.issues.listLabelsForRepo, { owner, repo, per_page: 100 })).map((label) => [
      label.name.toLowerCase(),
      label.name,
    ]),
  );
  const found: string[] = [];
  for (const label of labels) {
    const name = existing.get(label.toLowerCase());
    if (name) {
      found.push(name);
    } else {
      core.warning(`Label ${label} not found in repository, ignored`);
    }
  }
  if (found.length) {
    core.info(`Add labels ${found.join(', ')}`);
    await octokit.rest.issues.addLabels({ owner, repo, issue_number: issueNumber, labels: found });
  }
}

async function addReviewers(
  octokit: Octokit,
  { owner, repo }: Pick<Repository, 'owner' | 'repo'>,
  pullNumber: number,
  reviewers: string[],
  teams: string[],
): Promise<void> {
  let teamSlugs = teams;
  if (teams.length) {
    // accept team names as well as slugs
    try {
      const slugs = new Map<string, string>();
      for (const team of await octokit.paginate(octokit.rest.teams.list, { org: owner, per_page: 100 })) {
        slugs.set(team.name, team.slug);
        slugs.set(team.slug, team.slug);
      }
      teamSlugs = teams.map((team) => slugs.get(team) ?? team);
    } catch {
      core.warning('Unable to list organization teams. Is this repository owned by an organization?');
    }
  }
  if (reviewers.length || teamSlugs.length) {
    core.info('Request reviews');
    await octokit.rest.pulls.requestReviewers({
      owner,
      repo,
      pull_number: pullNumber,
      reviewers,
      team_reviewers: teamSlugs,
    });
  }
}
