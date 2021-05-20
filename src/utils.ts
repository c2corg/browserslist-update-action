/**
 * A simple tagged template function that just copies the raw template string content.
 *
 * Used to help identify graphql types generation.
 */
export const gql = (strings: TemplateStringsArray): string => strings.raw[0];
