import { describe, expect, it } from "vitest";
import {
  hasInvite,
  inviteCookie,
  inviteMatches,
  inviteToken,
  requiredInviteCode,
} from "@/lib/invite";

describe("invites", () => {
  it("needs no invite when no code is set", () => {
    expect(requiredInviteCode(undefined)).toBeNull();
    expect(requiredInviteCode("  ")).toBeNull();
    expect(hasInvite(null, null)).toBe(true);
  });

  it("matches codes ignoring case and surrounding spaces", () => {
    const code = requiredInviteCode(" Level-Up ")!;
    expect(inviteMatches("level-up", code)).toBe(true);
    expect(inviteMatches(" LEVEL-UP", code)).toBe(true);
    expect(inviteMatches("level-down", code)).toBe(false);
  });

  it("accepts only the cookie the right code produces", () => {
    const code = "level-up";
    const cookie = `other=1; ${inviteCookie}=${inviteToken(code)}; x=y`;
    expect(hasInvite(cookie, code)).toBe(true);
    expect(hasInvite(`${inviteCookie}=${inviteToken("guess")}`, code)).toBe(
      false,
    );
    expect(hasInvite(`${inviteCookie}=short`, code)).toBe(false);
    expect(hasInvite("", code)).toBe(false);
    expect(hasInvite(null, code)).toBe(false);
  });
});
