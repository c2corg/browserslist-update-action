import { join as path } from 'path';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { exec } from '@actions/exec';

import {
  BrowserslistUpdateBranch,
  BrowserslistUpdateBranchQuery,
  BrowserslistUpdateBranchQueryVariables,
  CreatePr,
  CreatePrMutation,
  CreatePrMutationVariables,
  DeleteBranch,
  DeleteBranchMutation,
  DeleteBranchMutationVariables,
} from './generated/graphql';
import { print } from 'graphql/language/printer';

const githubToken = core.getInput('github_token');
const repositoryOwner = github.context.repo.owner;
const repositoryName = github.context.repo.repo;
const branch = core.getInput('branch');

const octokit = github.getOctokit(githubToken);

async function run(): Promise<void> {
  try {
    core.info('Check if there is a branch and a matching PR already existing for caniuse db update');
    const queryData: BrowserslistUpdateBranchQueryVariables = {
      owner: repositoryOwner,
      name: repositoryName,
      branch,
    };
    const query = await octokit.graphql<BrowserslistUpdateBranchQuery>({
      query: print(BrowserslistUpdateBranch),
      ...queryData,
    });

    let browserslistUpdateBranchExists = query?.repository?.refs?.totalCount || false;
    let browserslistUpdatePR: string | undefined = undefined;
    if (browserslistUpdateBranchExists) {
      const pullRequests = query?.repository?.refs?.edges?.[0]?.node?.associatedPullRequests;
      if (pullRequests?.totalCount === 1) {
        browserslistUpdatePR = pullRequests.edges?.[0]?.node?.id;
      }
    }
    if (browserslistUpdateBranchExists && !browserslistUpdatePR) {
      // delete branch first, it should have been done anyway when previous PR was merged
      core.info(`Branch ${branch} already exists but no PR associated, delete it first`);
      const mutationData: DeleteBranchMutationVariables = {
        input: {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-non-null-asserted-optional-chain
          refId: query?.repository?.refs?.edges?.[0]?.node?.id!,
        },
      };
      octokit.graphql<DeleteBranchMutation>({ query: print(DeleteBranch), ...mutationData });
      browserslistUpdateBranchExists = !browserslistUpdateBranchExists;
    }

    // keep track of current branch
    let currentBranch = '';
    await exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      listeners: {
        stdout: (data: Buffer): void => {
          currentBranch += data.toString().trim();
        },
      },
    });

    if (browserslistUpdateBranchExists) {
      core.info(`Checkout branch ${branch}`);
      await exec('git', ['fetch']);
      await exec('git', ['checkout', branch]);
      await exec('git', ['rebase', 'origin/master']);
    } else {
      core.info(`Create new branch ${branch}`);
      await exec('git', ['checkout', '-b', branch]);
    }

    // Run npx browserslist update
    await exec('npx', ['browserslist@latest', '--update-db']);

    core.info('Check whether new files bring modifications to the current branch');
    let gitStatus = '';
    await exec('git', ['status', '-s'], {
      listeners: {
        stdout: (data: Buffer): void => {
          gitStatus += data.toString().trim();
        },
      },
    });
    if (!gitStatus.trim()) {
      core.info('No changes. Exiting');
      return;
    }

    core.info('Add files and commit on master');
    await exec('git', ['add', '.']);
    await exec('git', ['commit', '-m', core.getInput('commit_message') || 'Update caniuse database']);

    // setup credentials
    await exec('bash', [path(__dirname, 'setup-credentials.sh')]);

    core.info('Push branch to origin');
    if (browserslistUpdateBranchExists) {
      await exec('git', ['push', '--force']);
    } else {
      await exec('git', ['push', '--set-upstream', 'origin', branch]);
    }

    // create PR if not exists
    if (!browserslistUpdatePR) {
      core.info(`Creating new PR for branch ${branch}`);
      const title = core.getInput('title') || '📈 Update caniuse database';
      const body =
        core.getInput('body') || 'Caniuse database has been updated. Review changes, merge this PR and have a 🍺.';
      const mutationData: CreatePrMutationVariables = {
        input: {
          title,
          body,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-non-null-asserted-optional-chain
          repositoryId: query?.repository?.id!,
          baseRefName: 'master',
          headRefName: branch,
        },
      };
      await octokit.graphql<CreatePrMutation>({ query: print(CreatePr), ...mutationData });
    } else {
      core.info('PR already exists');
    }

    // go back to previous branch
    await exec('git', ['checkout', currentBranch]);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('Error');
    }
  }
}

run();
