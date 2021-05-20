import { gql } from './utils';

export default gql`
  mutation CreatePRMutation($input: CreatePullRequestInput!) {
    createPullRequest(input: $input) {
      clientMutationId
      pullRequest {
        body
        title
      }
    }
  }
`;
