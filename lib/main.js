"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = require("path");
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const exec_1 = require("@actions/exec");
const create_pr_mutation_1 = __importDefault(require("./create-pr-mutation"));
const delete_branch_mutation_1 = __importDefault(require("./delete-branch-mutation"));
const browserslist_update_branch_query_1 = __importDefault(require("./browserslist-update-branch-query"));
const githubToken = core.getInput('github_token');
const repositoryOwner = github.context.repo.owner;
const repositoryName = github.context.repo.repo;
const branch = core.getInput('branch');
const octokit = github.getOctokit(githubToken);
function run() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    return __awaiter(this, void 0, void 0, function* () {
        try {
            core.info('Check if there is a branch and a matching PR already existing for caniuse db update');
            const queryData = {
                owner: repositoryOwner,
                name: repositoryName,
                branch,
            };
            const query = yield octokit.graphql(Object.assign({ query: browserslist_update_branch_query_1.default }, queryData));
            let browserslistUpdateBranchExists = ((_b = (_a = query === null || query === void 0 ? void 0 : query.repository) === null || _a === void 0 ? void 0 : _a.refs) === null || _b === void 0 ? void 0 : _b.totalCount) || false;
            let browserslistUpdatePR = undefined;
            if (browserslistUpdateBranchExists) {
                const pullRequests = (_e = ((_d = (_c = query === null || query === void 0 ? void 0 : query.repository) === null || _c === void 0 ? void 0 : _c.refs) === null || _d === void 0 ? void 0 : _d.edges)[0].node) === null || _e === void 0 ? void 0 : _e.associatedPullRequests;
                if ((pullRequests === null || pullRequests === void 0 ? void 0 : pullRequests.totalCount) === 1) {
                    browserslistUpdatePR = (_f = pullRequests.edges[0].node) === null || _f === void 0 ? void 0 : _f.id;
                }
            }
            if (browserslistUpdateBranchExists && !browserslistUpdatePR) {
                // delete branch first, it should have been done anyway when previous PR was merged
                core.info(`Branch ${branch} already exists but no PR associated, delete it first`);
                const mutationData = {
                    input: {
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-non-null-asserted-optional-chain
                        refId: (_j = ((_h = (_g = query === null || query === void 0 ? void 0 : query.repository) === null || _g === void 0 ? void 0 : _g.refs) === null || _h === void 0 ? void 0 : _h.edges)[0].node) === null || _j === void 0 ? void 0 : _j.id,
                    },
                };
                octokit.graphql(Object.assign({ query: delete_branch_mutation_1.default }, mutationData));
                browserslistUpdateBranchExists = !browserslistUpdateBranchExists;
            }
            // keep track of current branch
            let currentBranch = '';
            yield (0, exec_1.exec)('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
                listeners: {
                    stdout: (data) => {
                        currentBranch += data.toString().trim();
                    },
                },
            });
            if (browserslistUpdateBranchExists) {
                core.info(`Checkout branch ${branch}`);
                yield (0, exec_1.exec)('git', ['fetch']);
                yield (0, exec_1.exec)('git', ['checkout', branch]);
                yield (0, exec_1.exec)('git', ['rebase', 'origin/master']);
            }
            else {
                core.info(`Create new branch ${branch}`);
                yield (0, exec_1.exec)('git', ['checkout', '-b', branch]);
            }
            // Run npx browserslist update
            yield (0, exec_1.exec)('npx', ['browserslist@latest', '--update-db']);
            core.info('Check whether new files bring modifications to the current branch');
            let gitStatus = '';
            yield (0, exec_1.exec)('git', ['status', '-s'], {
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
            yield (0, exec_1.exec)('git', ['add', '.']);
            yield (0, exec_1.exec)('git', ['commit', '-m', core.getInput('commit_message') || 'Update caniuse database']);
            // setup credentials
            yield (0, exec_1.exec)('bash', [(0, path_1.join)(__dirname, 'setup-credentials.sh')]);
            core.info('Push branch to origin');
            if (browserslistUpdateBranchExists) {
                yield (0, exec_1.exec)('git', ['push', '--force']);
            }
            else {
                yield (0, exec_1.exec)('git', ['push', '--set-upstream', 'origin', branch]);
            }
            // create PR if not exists
            if (!browserslistUpdatePR) {
                core.info(`Creating new PR for branch ${branch}`);
                const title = core.getInput('title') || '📈 Update caniuse database';
                const body = core.getInput('body') || 'Caniuse database has been updated. Review changes, merge this PR and have a 🍺.';
                const mutationData = {
                    input: {
                        title,
                        body,
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-non-null-asserted-optional-chain
                        repositoryId: (_k = query === null || query === void 0 ? void 0 : query.repository) === null || _k === void 0 ? void 0 : _k.id,
                        baseRefName: 'master',
                        headRefName: branch,
                    },
                };
                yield octokit.graphql(Object.assign({ query: create_pr_mutation_1.default }, mutationData));
            }
            else {
                core.info('PR already exists');
            }
            // go back to previous branch
            yield (0, exec_1.exec)('git', ['checkout', currentBranch]);
        }
        catch (error) {
            core.setFailed(error.message);
        }
    });
}
run();
