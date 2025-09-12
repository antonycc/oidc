/**
 * OIDC Token endpoint handler
 * Exchanges authorization codes for access tokens and ID tokens
 */
import { oidcHandlers } from "../lib/oidc-ops.mjs";

export const handler = oidcHandlers.token;
