# browserslist-update-action

A GitHub Action that runs [`update-browserslist-db@latest`](https://github.com/browserslist/update-db) on a repository and proposes a pull request with the updated lockfile.

Dependabot does not update transitive dependencies such as `caniuse-lite`, so without this action the browsers targeted by your Browserslist config slowly go out of date.

Supported package managers: npm, yarn, pnpm, bun and deno, detected from the lockfile.

## Usage

```yaml
name: Update Browserslist database

on:
  schedule:
    - cron: '0 2 1,15 * *'
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

jobs:
  update-browserslist-database:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: c2corg/browserslist-update-action@v3
        with:
          branch: browserslist-update
          commit_message: 'build: update Browserslist db'
          title: 'build: update Browserslist db'
          labels: 'chores, github action'
          reviewers: 'user1,user2'
          teams: 'team1'
```

> [!IMPORTANT]
> With the default `GITHUB_TOKEN`, the _Allow GitHub Actions to create and approve pull requests_ option must be enabled in _Settings > Actions > General_.
>
> Pull requests opened with `GITHUB_TOKEN` do not trigger other workflows (e.g. your CI). Use a [fine-grained personal access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) or a GitHub App token in `github_token` if you need them to.

How it works:

1. If the pull request branch exists without an open pull request, it is deleted.
2. The branch is (re)created from the up-to-date base branch, then `update-browserslist-db@latest` runs in `directory`.
3. If tracked files changed, they are committed and force-pushed to the branch, and the pull request is created, or updated if it already exists.

The pull request branch belongs to the action: do not push commits to it, they are overwritten on the next run.

## Action inputs

All inputs are **optional**.

| Name           | Description                                                                                                                                 | Default                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| github_token   | Token used to push and to create the pull request: `GITHUB_TOKEN` (`contents: write`, `pull-requests: write`), a PAT or a GitHub App token. | `${{ github.token }}`                                        |
| branch         | The pull request branch name.                                                                                                               | `browserslist-update`                                        |
| base_branch    | The target branch into which the pull request will be merged.                                                                               | Repository default branch                                    |
| directory      | For monorepos, the directory to run the update in. Only changes in this directory are committed.                                            | `.`                                                          |
| commit_message | The message to use when committing changes.                                                                                                 | `Update caniuse database`                                    |
| title          | The title of the pull request.                                                                                                              | `📈 Update caniuse database`                                 |
| body           | The body of the pull request.                                                                                                               | A message with the installed version and the browser changes |
| labels         | A comma separated list of labels to add to the pull request. Labels missing from the repository are ignored.                                | (no label)                                                   |
| reviewers      | A comma separated list of user logins to request reviews from.                                                                              | (no users)                                                   |
| teams          | A comma separated list of team names or slugs to request reviews from.                                                                      | (no teams)                                                   |

If git has no committer identity configured, commits are made as `github-actions[bot]`.

## Action outputs

| Name      | Description                                                                                        |
| --------- | -------------------------------------------------------------------------------------------------- |
| has_pr    | `true` if changes were found and a pull request was created or updated, `false` otherwise.         |
| pr_number | The number of the pull request created or updated, if applies.                                     |
| pr_status | Can be either `created` or `updated` depending on whether the pull request was created or updated. |

## Upgrading

### From v2 to v3

- Runs on Node 24 (runner v2.327.1 or later).
- `github_token` is optional and defaults to `GITHUB_TOKEN`.
- `base_branch` defaults to the repository default branch instead of `master`.
- `reviewers` takes user logins and `teams` takes team names or slugs: GraphQL node IDs are no longer accepted.
- The default pull request body now lists the installed caniuse-lite version and the target browser changes.
- `fetch-depth: 0` and the _Configure git_ step are no longer needed.
- The token given in `github_token` is the one used to push, even when `actions/checkout` persisted another one.
- Only tracked files are committed.

### From v1 to v2

`v1` uses the deprecated `browserslist@latest --update-db` command. `v2` and later use `update-browserslist-db@latest`.

## Contributing

Requires Node 24 (see `.nvmrc`).

```sh
npm ci
npm run all             # lint, typecheck, test, build
INTEGRATION=1 npm test  # also run the integration test (real git and npm, needs network)
```

`dist/index.js` is the bundled action, built by Rollup. Commit it with your changes: CI fails when it is outdated.

### Release a version

1. Bump the version: `npm version <major|minor|patch> --no-git-tag-version`, rebuild and merge to `main`.
2. Tag the merge commit and move the major tag:

   ```sh
   git tag -a v3.0.1 -m v3.0.1
   git tag -fa v3 -m v3
   git push origin v3.0.1
   git push --force origin v3
   ```

3. Create the GitHub release from the `v3.0.1` tag with generated notes, and publish it to the Marketplace.
