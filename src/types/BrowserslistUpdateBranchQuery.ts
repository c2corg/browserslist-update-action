/* tslint:disable */
/* eslint-disable */
// @generated
// This file was automatically generated and should not be edited.


// ====================================================
// GraphQL query operation: BrowserslistUpdateBranchQuery
// ====================================================


export interface BrowserslistUpdateBranchQuery_repository_refs_edges_node_associatedPullRequests_edges_node {
  readonly __typename: "PullRequest";
  readonly id: string;
}

export interface BrowserslistUpdateBranchQuery_repository_refs_edges_node_associatedPullRequests_edges {
  readonly __typename: "PullRequestEdge";
  /**
   * The item at the end of the edge.
   */
  readonly node: BrowserslistUpdateBranchQuery_repository_refs_edges_node_associatedPullRequests_edges_node | null;
}

export interface BrowserslistUpdateBranchQuery_repository_refs_edges_node_associatedPullRequests {
  readonly __typename: "PullRequestConnection";
  /**
   * Identifies the total count of items in the connection.
   */
  readonly totalCount: number;
  /**
   * A list of edges.
   */
  readonly edges: ReadonlyArray<(BrowserslistUpdateBranchQuery_repository_refs_edges_node_associatedPullRequests_edges | null)> | null;
}

export interface BrowserslistUpdateBranchQuery_repository_refs_edges_node {
  readonly __typename: "Ref";
  readonly id: string;
  /**
   * A list of pull requests with this ref as the head ref.
   */
  readonly associatedPullRequests: BrowserslistUpdateBranchQuery_repository_refs_edges_node_associatedPullRequests;
}

export interface BrowserslistUpdateBranchQuery_repository_refs_edges {
  readonly __typename: "RefEdge";
  /**
   * The item at the end of the edge.
   */
  readonly node: BrowserslistUpdateBranchQuery_repository_refs_edges_node | null;
}

export interface BrowserslistUpdateBranchQuery_repository_refs {
  readonly __typename: "RefConnection";
  /**
   * Identifies the total count of items in the connection.
   */
  readonly totalCount: number;
  /**
   * A list of edges.
   */
  readonly edges: ReadonlyArray<(BrowserslistUpdateBranchQuery_repository_refs_edges | null)> | null;
}

export interface BrowserslistUpdateBranchQuery_repository {
  readonly __typename: "Repository";
  readonly id: string;
  /**
   * Fetch a list of refs from the repository
   */
  readonly refs: BrowserslistUpdateBranchQuery_repository_refs | null;
}

export interface BrowserslistUpdateBranchQuery {
  /**
   * Lookup a given repository by the owner and repository name.
   */
  readonly repository: BrowserslistUpdateBranchQuery_repository | null;
}

export interface BrowserslistUpdateBranchQueryVariables {
  readonly owner: string;
  readonly name: string;
  readonly branch: string;
}
