import { createLogger } from "@/lib/logger";
import { createServiceForHost } from "@/lib/service";
import { getUserByID, ServiceConfig } from "@/lib/zitadel";
import { Client, Code, ConnectError } from "@zitadel/client";
import { InternalPermissionService } from "@zitadel/proto/zitadel/internal_permission/v2/internal_permission_service_pb";

const logger = createLogger("self-management");

/**
 * The organization role that lets a person manage their own account through
 * the API — above all `user.self.delete`. ZITADEL grants that permission
 * through no other route: a plain user's own token can read and edit their
 * profile, but deleting the account answers PermissionDenied until they hold a
 * membership with this role (or SELF_MANAGEMENT_GLOBAL on the instance).
 */
export const SELF_MANAGEMENT_ROLE = "ORG_USER_SELF_MANAGER";

/**
 * VENHO FORK: grant a newly created person the right to delete their own
 * account, so "Delete account" in Venho can do it rather than send them to an
 * admin console that has no such button for them.
 *
 * Called at every place the login app creates a user: sign-up with a password
 * or passkey, sign-up through an IdP with the form, and IdP auto-creation.
 * The login client's PAT carries `org.member.write` (IAM_LOGIN_CLIENT), which
 * is what adding the membership needs.
 *
 * Never throws: an account that could not be given the role is still an
 * account, and sign-up must not fail over it. deploy/venho/grant-self-delete.sh
 * backfills anyone who was missed. An existing membership (AlreadyExists) is
 * left as it is — whoever holds one already has at least as much.
 */
export async function grantSelfManagement({
  serviceConfig,
  userId,
  organizationId,
}: {
  serviceConfig: ServiceConfig;
  userId: string;
  /** The user's organization. Looked up when the caller does not know it. */
  organizationId?: string;
}): Promise<void> {
  try {
    let orgId = organizationId;
    if (!orgId) {
      const user = await getUserByID({ serviceConfig, userId });
      orgId = user.user?.details?.resourceOwner;
    }
    if (!orgId) {
      logger.warn("Self-management not granted: no organization for user", { userId });
      return;
    }

    const permissionService: Client<typeof InternalPermissionService> = await createServiceForHost(
      InternalPermissionService,
      serviceConfig,
    );
    await permissionService.createAdministrator({
      userId,
      resource: { resource: { case: "organizationId", value: orgId } },
      roles: [SELF_MANAGEMENT_ROLE],
    });
  } catch (error) {
    if (error instanceof ConnectError && error.code === Code.AlreadyExists) {
      return;
    }
    logger.error("Self-management not granted", { userId, error });
  }
}
