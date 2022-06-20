/* tslint:disable */
/* eslint-disable */
// @generated
// This file was automatically generated and should not be edited.

import { CreatePullRequestInput } from "./graphql-types";

// ====================================================
// GraphQL mutation operation: CreatePRMutation
// ====================================================

export interface CreatePRMutation_createPullRequest_pullRequest {
  readonly __typename: "PullRequest";
  /**
   * The body as Markdown.
   */
  readonly body: string;
  /**
   * Identifies the pull request title.
   */
  readonly title: string;
}

export interface CreatePRMutation_createPullRequest {
  readonly __typename: "CreatePullRequestPayload";
  /**
   * A unique identifier for the client performing the mutation.
   */
  readonly clientMutationId: string | null;
  /**
   * The new pull request.
   */
  readonly pullRequest: CreatePRMutation_createPullRequest_pullRequest | null;
}

export interface CreatePRMutation {
  /**
   * Create a new pull request
   */
  readonly createPullRequest: CreatePRMutation_createPullRequest | null;
}

export interface CreatePRMutationVariables {
  readonly input: CreatePullRequestInput;
}
