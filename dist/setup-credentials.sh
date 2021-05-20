#!/bin/bash
set -u

# Set up .netrc file with GitHub credentials
cat <<-EOF >$HOME/.netrc
    machine github.com
    login $GITHUB_ACTOR
    password $INPUT_GITHUB_TOKEN
    machine api.github.com
    login $GITHUB_ACTOR
    password $INPUT_GITHUB_TOKEN
EOF
chmod 600 $HOME/.netrc
