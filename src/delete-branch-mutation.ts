import { gql } from './utils';

export default gql`
  mutation DeleteBranchMutation($input: DeleteRefInput!) {
    deleteRef(input: $input) {
      clientMutationId
    }
  }
`;
