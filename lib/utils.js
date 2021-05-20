"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gql = void 0;
/**
 * A simple tagged template function that just copies the raw template string content.
 *
 * Used to help identify graphql types generation.
 */
const gql = (strings) => strings.raw[0];
exports.gql = gql;
