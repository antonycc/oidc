/**
 * OIDC Authorization endpoint handler
 * Processes authorization requests and issues authorization codes
 */
import { oidcHandlers } from "../lib/oidc-ops.mjs";

export const handler = oidcHandlers.authorize;
