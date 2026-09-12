import { NextFunction, Request, Response } from "express";
import { NotAllowedError } from "../../errors/not_allowed";
import { NotAuthorizedError } from "../../errors/not_authorized_error";
import { isAdmin } from "../is_admin";
import { isBuyer } from "../is_buyer";
import { isSeller } from "../is_seller";

type RoleGuard = (req: Request, res: Response, next: NextFunction) => void;

const requestWithRole = (role?: string, authenticated = true) =>
  ({
    currentUser: authenticated
      ? { id: 1, email: "user@example.com", role }
      : undefined,
  }) as unknown as Request;

const runGuard = (guard: RoleGuard, role?: string, authenticated = true) => {
  const next = jest.fn();
  try {
    guard(requestWithRole(role, authenticated), {} as Response, next);
  } catch (error) {
    return error;
  }
  return next.mock.calls[0]?.[0];
};

describe("role authorization middleware", () => {
  it.each([
    ["buyer", isBuyer],
    ["seller", isSeller],
    ["admin", isAdmin],
  ])("allows %s users through their matching guard", (role, guard) => {
    expect(runGuard(guard, role)).toBeUndefined();
  });

  it.each([
    ["buyer", isBuyer],
    ["seller", isSeller],
    ["admin", isAdmin],
  ])("denies %s users at non-matching guards", (role, guard) => {
    const otherRole = role === "buyer" ? "seller" : "buyer";

    expect(runGuard(guard, otherRole)).toBeInstanceOf(NotAllowedError);
  });

  it.each([
    ["buyer", isBuyer],
    ["seller", isSeller],
    ["admin", isAdmin],
  ])("fails closed when %s role resolution is absent", (role, guard) => {
    expect(runGuard(guard, undefined)).toBeInstanceOf(NotAllowedError);
  });

  it("rejects requests without an authenticated user", () => {
    expect(runGuard(isBuyer, undefined, false)).toBeInstanceOf(
      NotAuthorizedError,
    );
    expect(runGuard(isSeller, undefined, false)).toBeInstanceOf(
      NotAuthorizedError,
    );
    expect(runGuard(isAdmin, undefined, false)).toBeInstanceOf(
      NotAuthorizedError,
    );
  });
});
