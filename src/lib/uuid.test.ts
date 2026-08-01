import { afterEach, describe, expect, it, vi } from "vitest";

import { createUuid, isUuid } from "@/lib/uuid";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createUuid", () => {
  it("creates a valid UUID with the platform API", () => {
    expect(isUuid(createUuid())).toBe(true);
  });

  it("creates a valid UUID when randomUUID is unavailable", () => {
    vi.stubGlobal("crypto", {
      getRandomValues(bytes: Uint8Array) {
        bytes.forEach((_, index) => {
          bytes[index] = index;
        });
        return bytes;
      },
    });

    expect(createUuid()).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
  });

  it("rejects legacy prototype identifiers", () => {
    expect(isUuid("stroke-msaachx4-2b7w0w9xlob")).toBe(false);
  });
});
