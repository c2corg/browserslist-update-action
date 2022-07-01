"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = require("path");
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const exec_1 = require("@actions/exec");
const parse_browserslist_output_1 = require("./parse-browserslist-output");
const graphql_1 = require("./generated/graphql");
const printer_1 = require("graphql/language/printer");
const githubToken = core.getInput('github_token');
const repositoryOwner = github.context.repo.owner;
const repositoryName = github.context.repo.repo;
const branch = core.getInput('branch');
const octokit = github.getOctokit(githubToken);
async function run() {
    try {
        core.info('Check if there is a branch and a matching PR already existing for caniuse db update');
        const queryData = {
            owner: repositoryOwner,
            name: repositoryName,
            branch,
        };
        const query = await octokit.graphql({
            query: (0, printer_1.print)(graphql_1.BrowserslistUpdateBranch),
            ...queryData,
        });
        let browserslistUpdateBranchExists = query?.repository?.refs?.totalCount || false;
        let browserslistUpdatePR = undefined;
        if (browserslistUpdateBranchExists) {
            const pullRequests = query?.repository?.refs?.edges?.[0]?.node?.associatedPullRequests;
            if (pullRequests?.totalCount === 1) {
                browserslistUpdatePR = pullRequests.edges?.[0]?.node?.id;
            }
        }
        if (browserslistUpdateBranchExists && !browserslistUpdatePR) {
            // delete branch first, it should have been done anyway when previous PR was merged
            core.info(`Branch ${branch} already exists but no PR associated, delete it first`);
            const mutationData = {
                input: {
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-non-null-asserted-optional-chain
                    refId: query?.repository?.refs?.edges?.[0]?.node?.id,
                },
            };
            octokit.graphql({ query: (0, printer_1.print)(graphql_1.DeleteBranch), ...mutationData });
            browserslistUpdateBranchExists = !browserslistUpdateBranchExists;
        }
        // keep track of current branch
        let currentBranch = '';
        await (0, exec_1.exec)('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
            listeners: {
                stdout: (data) => {
                    currentBranch += data.toString().trim();
                },
            },
        });
        if (browserslistUpdateBranchExists) {
            core.info(`Checkout branch ${branch}`);
            await (0, exec_1.exec)('git', ['fetch']);
            await (0, exec_1.exec)('git', ['checkout', branch]);
            await (0, exec_1.exec)('git', ['rebase', 'origin/master']);
        }
        else {
            core.info(`Create new branch ${branch}`);
            await (0, exec_1.exec)('git', ['checkout', '-b', branch]);
        }
        // Run npx browserslist update
        let browserslistOutput = '';
        await (0, exec_1.exec)('npx', ['browserslist@latest', '--update-db'], {
            listeners: {
                stdout: (data) => {
                    browserslistOutput += data.toString();
                },
            },
        });
        core.info('Check whether new files bring modifications to the current branch');
        let gitStatus = '';
        await (0, exec_1.exec)('git', ['status', '-s'], {
            listeners: {
                stdout: (data) => {
                    gitStatus += data.toString().trim();
                },
            },
        });
        if (!gitStatus.trim()) {
            core.info('No changes. Exiting');
            return;
        }
        core.info('Add files and commit on master');
        await (0, exec_1.exec)('git', ['add', '.']);
        await (0, exec_1.exec)('git', ['commit', '-m', core.getInput('commit_message') || 'Update caniuse database']);
        // setup credentials
        await (0, exec_1.exec)('bash', [(0, path_1.join)(__dirname, 'setup-credentials.sh')]);
        core.info('Push branch to origin');
        if (browserslistUpdateBranchExists) {
            await (0, exec_1.exec)('git', ['push', '--force']);
        }
        else {
            await (0, exec_1.exec)('git', ['push', '--set-upstream', 'origin', branch]);
        }
        // create PR if not exists
        if (!browserslistUpdatePR) {
            core.info(`Creating new PR for branch ${branch}`);
            const title = core.getInput('title') || '📈 Update caniuse database';
            const body = core.getInput('body') || prBody(browserslistOutput);
            const mutationData = {
                input: {
                    title,
                    body,
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-non-null-asserted-optional-chain
                    repositoryId: query?.repository?.id,
                    baseRefName: 'master',
                    headRefName: branch,
                },
            };
            await octokit.graphql({ query: (0, printer_1.print)(graphql_1.CreatePr), ...mutationData });
        }
        else {
            core.info('PR already exists, updating');
            const body = core.getInput('body') || prBody(browserslistOutput);
            const mutationData = {
                input: {
                    pullRequestId: browserslistUpdatePR,
                    body,
                },
            };
            await octokit.graphql({ query: (0, printer_1.print)(graphql_1.UpdatePullRequest), ...mutationData });
        }
        // go back to previous branch
        await (0, exec_1.exec)('git', ['checkout', currentBranch]);
    }
    catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        }
        else {
            core.setFailed('Error');
        }
    }
}
function prBody(browserslistOutput) {
    const info = (0, parse_browserslist_output_1.parse)(browserslistOutput);
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
