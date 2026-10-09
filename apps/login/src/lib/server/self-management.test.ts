import { Code, ConnectError } from "@zitadel/client";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { grantSelfManagement, SELF_MANAGEMENT_ROLE } from "./self-management";

const createAdministrator = vi.fn();

vi.mock("@/lib/service", () => ({
  createServiceForHost: vi.fn(async () => ({ createAdministrator })),
}));

vi.mock("@/lib/zitadel", () => ({
  getUserByID: vi.fn(),
}));

const serviceConfig = { baseUrl: "https://zitadel.example.com" };

describe("grantSelfManagement", () => {
  beforeEach(() => vi.clearAllMocks());

  test("makes the user a member of their organization with the self-management role", async () => {
    createAdministrator.mockResolvedValue({});

    await grantSelfManagement({ serviceConfig, userId: "user-1", organizationId: "org-1" });

    expect(SELF_MANAGEMENT_ROLE).toBe("ORG_USER_SELF_MANAGER");
    expect(createAdministrator).toHaveBeenCalledWith({
      userId: "user-1",
      resource: { resource: { case: "organizationId", value: "org-1" } },
      roles: ["ORG_USER_SELF_MANAGER"],
    });
  });

  test("looks the organization up when the caller does not know it", async () => {
    const { getUserByID } = await import("@/lib/zitadel");
    vi.mocked(getUserByID).mockResolvedValue({ user: { details: { resourceOwner: "org-9" } } } as any);
    createAdministrator.mockResolvedValue({});

    await grantSelfManagement({ serviceConfig, userId: "user-1" });

    expect(createAdministrator).toHaveBeenCalledWith(
      expect.objectContaining({ resource: { resource: { case: "organizationId", value: "org-9" } } }),
    );
  });

  test("an existing membership is left alone, quietly", async () => {
    createAdministrator.mockRejectedValue(new ConnectError("member exists", Code.AlreadyExists));
    await expect(grantSelfManagement({ serviceConfig, userId: "user-1", organizationId: "org-1" })).resolves.toBe(undefined);
  });

  test("never fails the sign-up it is part of", async () => {
    createAdministrator.mockRejectedValue(new ConnectError("denied", Code.PermissionDenied));
    await expect(grantSelfManagement({ serviceConfig, userId: "user-1", organizationId: "org-1" })).resolves.toBe(undefined);
  });
});
