import { describe, it, expect } from "vitest";
import { isProtectedRoute } from "./middleware";

describe("isProtectedRoute", () => {
  it("does not protect the landing page", () => {
    expect(isProtectedRoute("/")).toBe(false);
  });
  it("does not protect the login page", () => {
    expect(isProtectedRoute("/login")).toBe(false);
  });
  it("does not protect the signup page", () => {
    expect(isProtectedRoute("/signup")).toBe(false);
  });
  it("protects the dashboard", () => {
    expect(isProtectedRoute("/dashboard")).toBe(true);
  });
  it("protects nested routes", () => {
    expect(isProtectedRoute("/exercises/123")).toBe(true);
  });
});
