import { gql } from './utils';

export default gql`
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
