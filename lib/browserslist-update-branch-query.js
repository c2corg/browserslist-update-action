"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("./utils");
exports.default = (0, utils_1.gql) `
  query BrowserslistUpdateBranchQuery($owner: String!, $name: String!, $branch: String!) {
    repository(owner: $owner, name: $name) {
      id
      refs(refPrefix: "refs/heads/", query: $branch, first: 1) {
        totalCount
        edges {
          node {
            id
            associatedPullRequests(first: 1, states: [OPEN]) {
              totalCount
              edges {
                node {
                  id
                }
              }
            }
          }
        }
      }
    }
  }
`;
