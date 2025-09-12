/**
 * OIDC JWKS (JSON Web Key Set) endpoint handler
 * Returns the public keys used for token verification
 */
import { oidcHandlers } from "../lib/oidc-ops.mjs";

export const handler = oidcHandlers.jwks;
