# browserslist-update-action

A Github Action that runs `npx browserslist@latest --update-db` on a repository and proposes a pull request to merge updates.

## Usage

```yaml
steps:
- name: Checkout repository
uses: actions/checkout@v2
with:
    fetch-depth: 0
- name: Configure git
run: |
    git config --global user.email "action@github.com"
    git config --global user.name "GitHub Action"
- name: Update caniuse database and create PR if applies
uses: c2corg/browserslist-update-action@v1
with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    branch: browserslist-update
```

One will usually run this action on a cron basis (say, every day or week)

## Contributing

### Edit / add GraphQL queries and mutations

`src/types` folder contains generated type definitions based on queries. Run `npm run types` to update.

### Release a version

```sh
npm run lint
npm run build
npm run pack
```

Or shortly

```sh
npm run all
```

Then bump version number in `package.json` and `package-lock.json`. Push commits.

Keep an major version tag synchronized with updates, e.g. if you publish version `v2.0.3`, then a `v2` tag should be positioned at the same location.
