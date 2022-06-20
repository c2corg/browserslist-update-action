/* tslint:disable */
/* eslint-disable */
// @generated
// This file was automatically generated and should not be edited.

import { DeleteRefInput } from "./graphql-types";

// ====================================================
// GraphQL mutation operation: DeleteBranchMutation
// ====================================================

export interface DeleteBranchMutation_deleteRef {
  readonly __typename: "DeleteRefPayload";
  /**
   * A unique identifier for the client performing the mutation.
   */
  readonly clientMutationId: string | null;
}

export interface DeleteBranchMutation {
  /**
   * Delete a Git Ref.
   */
  readonly deleteRef: DeleteBranchMutation_deleteRef | null;
}

export interface DeleteBranchMutationVariables {
  readonly input: DeleteRefInput;
}
