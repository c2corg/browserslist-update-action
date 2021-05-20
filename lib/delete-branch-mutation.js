"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("./utils");
exports.default = utils_1.gql `
  mutation DeleteBranchMutation($input: DeleteRefInput!) {
    deleteRef(input: $input) {
      clientMutationId
    }
  }
`;
