/**
 * OIDC UserInfo endpoint handler
 * Returns user information based on the provided access token
 */
import { oidcHandlers } from "../lib/oidc-ops.mjs";

export const handler = oidcHandlers.userinfo;
