import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { Session } from "@zitadel/proto/zitadel/session/v2/session_pb";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SessionsList } from "./sessions-list";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    t.has = () => false;
    return t;
  },
}));

vi.mock("@/lib/server/session", () => ({
  continueWithSession: vi.fn(),
}));

function session(id: string, loginName: string, displayName: string, changedAtSeconds: number): Session {
  return {
    id,
    changeDate: { seconds: BigInt(changedAtSeconds), nanos: 0 },
    factors: { user: { id: `user-${id}`, loginName, displayName, organizationId: "org" } },
  } as unknown as Session;
}

const john = session("s1", "john_doe", "John Doe", 100);
const olivia = session("s2", "oliviarodriguez", "", 200);

describe("SessionsList — the account picker, as designed", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  test("one tile per account, most recently used first, with name over login name", () => {
    const { getAllByTestId } = render(<SessionsList sessions={[john, olivia]} />);

    const tiles = getAllByTestId("account-tile");
    // Initials first (CSS uppercases them), then the text. No display name:
    // the login name stands alone.
    expect(tiles.map((t) => t.textContent)).toEqual(["ooliviarodriguez", "JDJohn Doejohn_doe"]);
  });

  test("shows the profile picture when there is one, initials otherwise", () => {
    const { getAllByTestId } = render(
      <SessionsList sessions={[john, olivia]} avatarUrlById={{ s2: "https://example.test/olivia.png" }} />,
    );

    const [oliviaTile, johnTile] = getAllByTestId("account-tile");
    expect(oliviaTile.querySelector("img")?.getAttribute("src")).toBe("https://example.test/olivia.png");
    expect(johnTile.querySelector("img")).toBeNull();
  });

  test("carries none of upstream's extras: no Continue-as button, status dot or remove control", () => {
    const { queryByTestId, container } = render(<SessionsList sessions={[john]} />);

    expect(queryByTestId("continue-as-button")).toBeNull();
    expect(container.querySelector(".bg-green-500, .bg-red-500")).toBeNull();
    expect(container.querySelectorAll("button")).toHaveLength(1);
  });

  test("a tile continues as that account, inside the flow it was opened for", async () => {
    const { continueWithSession } = await import("@/lib/server/session");
    vi.mocked(continueWithSession).mockResolvedValue({ redirect: "/device/consent?requestId=device_abc" });

    const { getByTestId } = render(<SessionsList sessions={[john]} requestId="device_abc" />);
    fireEvent.click(getByTestId("account-tile"));

    await waitFor(() =>
      expect(continueWithSession).toHaveBeenCalledWith(expect.objectContaining({ id: "s1", requestId: "device_abc" })),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/device/consent?requestId=device_abc"));
  });
});
