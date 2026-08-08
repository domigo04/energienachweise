import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearAuthSession,
  getStoredUser,
  getToken,
  setStoredUser,
  setToken,
} from "./api";


function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}


describe("Auth-Sitzung", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", memoryStorage());
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  it("legt Token und Benutzer nur im sessionStorage ab", () => {
    setToken("kurzlebiges-token");
    setStoredUser({ id: 7, email: "pilot@example.test" });

    expect(getToken()).toBe("kurzlebiges-token");
    expect(getStoredUser()).toEqual({ id: 7, email: "pilot@example.test" });
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it("entfernt Token und Benutzer gemeinsam", () => {
    setToken("token");
    setStoredUser({ id: 7 });

    clearAuthSession();

    expect(getToken()).toBeNull();
    expect(getStoredUser()).toBeNull();
  });
});
