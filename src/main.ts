import * as core from '@actions/core';
import { exec } from '@actions/exec';
import * as github from '@actions/github';
import { GitHub, getOctokitOptions } from '@actions/github/lib/utils';
import { paginateGraphql } from '@octokit/plugin-paginate-graphql';
import { print } from 'graphql/language/printer';
import { detect, resolveCommand } from 'package-manager-detector';
import { join as path } from 'path';
import { chdir, cwd } from 'process';
import {
  AddLabels,
  AddReviewers,
  BrowserslistUpdateBranch,
  BrowserslistUpdateBranchQueryVariables,
  CreatePr,
  DeleteBranch,
  Labels,
  Organization,
  OrganizationQuery,
  OrganizationQueryVariables,
  UpdatePullRequest,
  User,
  UserQuery,
  UserQueryVariables,
  type AddLabelsMutation,
  type AddLabelsMutationVariables,
  type AddReviewersMutation,
  type AddReviewersMutationVariables,
  type BrowserslistUpdateBranchQuery,
  type CreatePrMutation,
  type CreatePrMutationVariables,
  type DeleteBranchMutation,
  type DeleteBranchMutationVariables,
  type LabelsQuery,
  type LabelsQueryVariables,
  type UpdatePullRequestMutation,
  type UpdatePullRequestMutationVariables,
} from './generated/graphql';
import { parse } from './parse-browserslist-output';

const githubToken = core.getInput('github_token', { required: true });
const repositoryOwner = github.context.repo.owner;
const repositoryName = github.context.repo.repo;
const branch = core.getInput('branch') || 'browserslist-update';
const baseBranch = core.getInput('base_branch') || 'master';
const labels = (core.getInput('labels') || '')
  .split(',')
  .map((label) => label.trim())
  .filter((label) => !!label);

const MyOctokit = GitHub.plugin(paginateGraphql);
const octokit = new MyOctokit(getOctokitOptions(githubToken));

async function run(): Promise<void> {
  try {
    core.info('Check if there is a branch and a matching PR already existing for caniuse db update');
    const browserslistUpdateBranchQueryData: BrowserslistUpdateBranchQueryVariables = {
      owner: repositoryOwner,
      name: repositoryName,
      branch,
    };
    const browserslistUpdateBranchQuery = await octokit.graphql<BrowserslistUpdateBranchQuery>({
      query: print(BrowserslistUpdateBranch),
      ...browserslistUpdateBranchQueryData,
    });

    let browserslistUpdateBranchExists = browserslistUpdateBranchQuery.repository?.refs?.totalCount || false;
    let browserslistUpdatePR: string | undefined = undefined;
    if (browserslistUpdateBranchExists) {
      const pullRequests = browserslistUpdateBranchQuery.repository?.refs?.edges?.[0]?.node?.associatedPullRequests;
      if (pullRequests?.totalCount === 1) {
        browserslistUpdatePR = pullRequests.edges?.[0]?.node?.id;
      }
    }
    if (browserslistUpdateBranchExists && !browserslistUpdatePR) {
      // delete branch first, it should have been done anyway when previous PR was merged
      core.info(`Branch ${branch} already exists but no PR associated, delete it first`);
      const mutationData: DeleteBranchMutationVariables = {
        input: {
          // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
          refId: browserslistUpdateBranchQuery.repository?.refs?.edges?.[0]?.node?.id!,
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
      await exec('git', ['rebase', `origin/${baseBranch}`]);
    } else {
      core.info(`Create new branch ${branch}`);
      await exec('git', ['checkout', '-b', branch]);
    }

    // Run npx browserslist update
    const subDir = (core.getInput('directory') || '.').trim();
    const currentDir = cwd();
    if (subDir !== '.') {
      core.info(`Switching to dir ${subDir} to run update db command`);
      chdir(subDir);
    }
    let browserslistOutput = '';
    const pkgMgr = await detect();
    if (!pkgMgr) {
      core.setFailed('Could not detect package manager');
      return;
    }
    const { command, args } = resolveCommand(pkgMgr.agent, 'execute', ['update-browserslist-db@latest'])!;
    await exec(command, args, {
      listeners: {
        stdout: (data: Buffer) => {
          browserslistOutput += data.toString();
        },
      },
    });
    if (subDir !== '.') {
      chdir(currentDir);
    }

    core.info('Check whether new files bring modifications to the current branch');
    let gitStatus = '';
    await exec('git', ['status', '-s'], {
      listeners: {
        stdout: (data: Buffer): void => {
          gitStatus += data.toString();
        },
      },
    });
    const changedFiles = gitStatus
      .trim()
      .split('\n')
      .map((line) => line.trim().split(' ').slice(1).join(' '));
    const lockfile = {
      npm: 'package-lock.json',
      yarn: 'yarn.lock',
      pnpm: 'pnpm-lock.yaml',
    }[pkgMgr.agent];
    const filesToCommit = changedFiles.filter(
      (file) => file === 'package.json' || (lockfile && file === lockfile) || file === '.browserslistrc',
    );
    if (filesToCommit.length === 0) {
      core.setOutput('has_pr', false);
      core.info('No changes to package.json, lockfile or .browserslistrc. Exiting');
      return;
    }

    core.setOutput('has_pr', true);

    core.info('Add files and commit on base branch');
    await exec('git', ['add', ...filesToCommit]);
    await exec('git', ['commit', '-m', core.getInput('commit_message') || 'Update caniuse database']);

    // setup credentials
    await exec('bash', [path(__dirname, 'setup-credentials.sh')]);

    core.info('Push branch to origin');
    if (browserslistUpdateBranchExists) {
      await exec('git', ['push', '--force']);
    } else {
      await exec('git', ['push', '--set-upstream', 'origin', branch]);
    }

    let prNumber: number;
    let prId: string;

    // create PR if not exists
    if (!browserslistUpdatePR) {
      core.info(`Creating new PR for branch ${branch}`);
      const title = core.getInput('title') || '📈 Update caniuse database';
      const body = core.getInput('body') || (await prBody(browserslistOutput));
      const mutationData: CreatePrMutationVariables = {
        input: {
          title,
          body,
          // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
          repositoryId: browserslistUpdateBranchQuery.repository?.id!,
          baseRefName: baseBranch,
          headRefName: branch,
        },
      };
      const response = await octokit.graphql<CreatePrMutation>({ query: print(CreatePr), ...mutationData });
      // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
      prNumber = response.createPullRequest?.pullRequest?.number!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
      prId = response.createPullRequest?.pullRequest?.id!;
      core.setOutput('pr_status', 'created');
    } else {
      core.info('PR already exists, updating');
      const body = core.getInput('body') || (await prBody(browserslistOutput));
      const mutationData: UpdatePullRequestMutationVariables = {
        input: {
          pullRequestId: browserslistUpdatePR,
          body,
        },
      };
      const response = await octokit.graphql<UpdatePullRequestMutation>({
        query: print(UpdatePullRequest),
        ...mutationData,
      });
      // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
      prNumber = response.updatePullRequest?.pullRequest?.number!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
      prId = response.updatePullRequest?.pullRequest?.id!;

      core.setOutput('pr_status', 'updated');
    }
    core.setOutput('pr_number', prNumber);

    // apply labels (if matching label found, do not attempt to create missing label)
    const labelsQueryData: LabelsQueryVariables = {
      owner: repositoryOwner,
      name: repositoryName,
    };
    const labelIds =
      (await octokit.graphql.paginate<LabelsQuery>(print(Labels), labelsQueryData)).repository?.labels?.nodes
        // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
        ?.filter((node) => labels.includes(node?.name!))
        // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
        .map((node) => node?.id!) ?? [];
    if (labelIds.length) {
      const addLabelsMutationData: AddLabelsMutationVariables = {
        input: {
          labelableId: prId,
          labelIds,
        },
      };
      await octokit.graphql<AddLabelsMutation>({ query: print(AddLabels), ...addLabelsMutationData });
    }

    let reviewers = (core.getInput('reviewers') || '')
      .split(',')
      .map((reviewer) => reviewer.trim())
      .filter(Boolean);
    reviewers = await Promise.all(
      reviewers.map(async (reviewer) => {
        // try to replace reviewer login by its corresponding ID. Otherwise, consider we already deal with the ID
        const userQueryData: UserQueryVariables = { login: reviewer };
        return octokit.graphql<UserQuery>({ query: print(User), ...userQueryData }).then(
          (response) => response?.user?.id ?? reviewer,
          () => reviewer,
        );
      }),
    );
    let teamReviewers = (core.getInput('teams') || '')
      .split(',')
      .map((team) => team.trim())
      .filter((team) => !!team);

    if (teamReviewers.length) {
      try {
        const organizationQueryData: OrganizationQueryVariables = { login: repositoryOwner };
        const teams = new Map(
          (
            (await octokit.graphql.paginate<OrganizationQuery>(print(Organization), organizationQueryData))
              ?.organization?.teams?.nodes ?? []
          ).map((team) => [team?.name, team?.id]),
        );
        teamReviewers = teamReviewers.map((team) => teams.get(team) ?? team);
      } catch {
        core.warning('Unable to retrieve organization info. Is this repository owned by an organization?');
      }
    }

    if (reviewers.length || teamReviewers.length) {
      core.info('Adding reviewers to the PR');
      const addReviewersMutationData: AddReviewersMutationVariables = {
        input: {
          pullRequestId: prId,
          union: true,
          userIds: reviewers,
          teamIds: teamReviewers,
        },
      };
      await octokit.graphql<AddReviewersMutation>({
        query: print(AddReviewers),
        ...addReviewersMutationData,
      });
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

async function prBody(browserslistOutput: string): Promise<string> {
  const info = await parse(browserslistOutput);
  const msg = ['Caniuse database has been updated. Review changes, merge this PR and have a 🍺.'];
  if (info.installedVersion) {
    msg.push(`Installed version: ${info.installedVersion}`);
  }
  if (info.latestVersion) {
    msg.push(`Latest version: ${info.latestVersion}`);
  }
  if (info.browsersAdded.length || info.browsersRemoved.length) {
    msg.push('Target browsers changes: ');
    msg.push('\n');
    msg.push('```diff');
    info.browsersRemoved.forEach((value) => msg.push('- ' + value));
    info.browsersAdded.forEach((value) => msg.push('+ ' + value));
    msg.push('```');
  }
  return msg.join('\n');
}

run();
