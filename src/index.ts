import * as core from '@actions/core';
import * as github from '@actions/github';
import { run } from './run.js';

const list = (name: string): string[] =>
  core
    .getInput(name)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

try {
  const token = core.getInput('github_token', { required: true });
  await run(
    {
      token,
      branch: core.getInput('branch') || 'browserslist-update',
      baseBranch: core.getInput('base_branch'),
      directory: core.getInput('directory') || '.',
      commitMessage: core.getInput('commit_message') || 'Update caniuse database',
      title: core.getInput('title') || '📈 Update caniuse database',
      body: core.getInput('body'),
      labels: list('labels'),
      reviewers: list('reviewers'),
      teams: list('teams'),
    },
    github.getOctokit(token),
    { ...github.context.repo, serverUrl: github.context.serverUrl },
  );
} catch (error) {
  if (error instanceof Error && error.stack) {
    core.debug(error.stack);
  }
  core.setFailed(error instanceof Error ? error.message : String(error));
}
