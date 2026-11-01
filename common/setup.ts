// Global variables to store user IDs
let adminUserId: string | null = null;

import { currentRequestContext } from "./context.js";
import { getUserIdByEmail, plankaRequest } from "./utils.js";

/**
 * Gets the admin user ID by looking up the user by email or username
 *
 * This function will try the following methods in order:
 * 1. Use the cached admin user ID if available
 * 2. Use the PLANKA_ADMIN_ID environment variable if set (for backwards compatibility)
 * 3. Look up the admin user ID by email using PLANKA_ADMIN_EMAIL
 * 4. Look up the admin user ID by username using PLANKA_ADMIN_USERNAME
 */
export async function getAdminUserId(): Promise<string | null> {
  // HTTP mode: the acting user is the owner of the caller's API key. Resolved
  // once per request and never shared with the process-wide cache below.
  const context = currentRequestContext();
  if (context) {
    if (context.userId === undefined) {
      context.userId = await getCurrentUserId();
    }
    return context.userId;
  }

  if (adminUserId) {
    return adminUserId;
  }

  try {
    // Check for direct admin ID (for backwards compatibility)
    const directAdminId = process.env.PLANKA_ADMIN_ID;
    if (directAdminId) {
      adminUserId = directAdminId;
      return adminUserId;
    }

    // Try to get the admin ID by email
    const adminEmail = process.env.PLANKA_ADMIN_EMAIL;
    if (adminEmail) {
      const id = await getUserIdByEmail(adminEmail);
      if (id) {
        adminUserId = id;
        return adminUserId;
      }
    }

    // Fallback to agent email.
    // In API key mode (PLANKA_API_KEY set) the agent password is not needed,
    // but PLANKA_AGENT_EMAIL may still be provided so this lookup can resolve
    // the acting user's ID without falling back to an admin address.
    const agentEmail = process.env.PLANKA_AGENT_EMAIL;
    if (agentEmail) {
      const id = await getUserIdByEmail(agentEmail);
      if (id) {
        adminUserId = id;
        return adminUserId;
      }
    }

    console.error(
      "Could not determine admin user ID. Please set PLANKA_ADMIN_ID, PLANKA_ADMIN_EMAIL, PLANKA_ADMIN_USERNAME, or PLANKA_AGENT_EMAIL.",
    );
    return null;
  } catch (error) {
    console.error("Failed to get admin user ID:", error);
    return null;
  }
}

/**
 * Id of the user who owns the API key of the current request (`/api/users/me`).
 */
async function getCurrentUserId(): Promise<string | null> {
  try {
    const response = (await plankaRequest("/api/users/me")) as { item?: { id?: unknown } };
    const id = response?.item?.id;
    return typeof id === "string" ? id : null;
  } catch (error) {
    console.error("Failed to resolve the current user:", error);
    return null;
  }
}
