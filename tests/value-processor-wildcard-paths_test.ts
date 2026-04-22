import { assertEquals } from "@std/assert";
import { postProcess } from "../src/tool/invoker.ts";
import { SENSITIVE_MARK } from "../src/tool/constants.ts";

// Mock the necessary objects for testing
const mockSpec = {} as unknown as Parameters<typeof postProcess>[0];
const createMockTool = (
  includeKeys: string[] = [],
  excludeKeys: string[] = [],
  sensitiveKeys: string[] = [],
) => {
  return {
    _rawOperation: {
      "x-sensitive-params": {},
      "x-include-response-keys": includeKeys,
      "x-exclude-response-keys": excludeKeys,
      "x-sensitive-response-fields": sensitiveKeys,
    },
  };
};

// Test data
const testData = {
  data: {
    items: [
      {
        id: 1,
        name: "Item 1",
        secret: "password1",
        metadata: { created: "2023-01-01", updated: "2023-01-02" },
      },
      {
        id: 2,
        name: "Item 2",
        secret: "password2",
        metadata: { created: "2023-02-01", updated: "2023-02-02" },
      },
    ],
    nested: {
      level1: {
        level2: {
          id: 100,
          secret: "top-secret",
          timestamp: "2023-03-01",
        },
      },
    },
    stats: {
      count: 2,
      timestamp: "2023-04-01",
    },
  },
};

Deno.test("Single-level wildcard (*) - exclude keys", () => {
  const mockTool = createMockTool([], ["data.items.*.secret"], []);
  const result = postProcess(
    mockSpec,
    mockTool as unknown as Parameters<typeof postProcess>[1],
    testData,
  );

  // deno-lint-ignore no-explicit-any
  const r = result as Record<string, any>;
  assertEquals(r.data.items[0].secret, undefined);
  assertEquals(r.data.items[1].secret, undefined);
  assertEquals(r.data.items[0].id, 1);
  assertEquals(r.data.items[0].name, "Item 1");
  assertEquals(r.data.items[1].id, 2);
  assertEquals(r.data.items[1].name, "Item 2");
});

Deno.test("Single-level wildcard (*) - include keys", () => {
  const mockTool = createMockTool(
    ["data.items.*.id", "data.items.*.name"],
    [],
    [],
  );
  const result = postProcess(
    mockSpec,
    mockTool as unknown as Parameters<typeof postProcess>[1],
    testData,
  );

  // deno-lint-ignore no-explicit-any
  const r = result as Record<string, any>;
  assertEquals(r.data.items[0].id, 1);
  assertEquals(r.data.items[0].name, "Item 1");
  assertEquals(r.data.items[0].secret, undefined);
  assertEquals(r.data.items[1].id, 2);
  assertEquals(r.data.items[1].name, "Item 2");
  assertEquals(r.data.items[1].secret, undefined);
  assertEquals(r.data.nested, undefined);
  assertEquals(r.data.stats, undefined);
});

Deno.test("Multi-level wildcard (**) - exclude keys", () => {
  const mockTool = createMockTool([], ["data.**.secret"], []);
  const result = postProcess(
    mockSpec,
    mockTool as unknown as Parameters<typeof postProcess>[1],
    testData,
  );

  // deno-lint-ignore no-explicit-any
  const r = result as Record<string, any>;
  assertEquals(r.data.items[0].secret, undefined);
  assertEquals(r.data.items[1].secret, undefined);
  assertEquals(r.data.nested.level1.level2.secret, undefined);
  assertEquals(r.data.items[0].id, 1);
  assertEquals(r.data.nested.level1.level2.id, 100);
});

Deno.test("Multi-level wildcard (**) - include keys", () => {
  const mockTool = createMockTool(["data.**.id"], [], []);
  const result = postProcess(
    mockSpec,
    mockTool as unknown as Parameters<typeof postProcess>[1],
    testData,
  );

  // deno-lint-ignore no-explicit-any
  const r = result as Record<string, any>;
  assertEquals(r.data.items[0].id, 1);
  assertEquals(r.data.items[1].id, 2);
  assertEquals(r.data.nested.level1.level2.id, 100);
  assertEquals(r.data.items[0].name, undefined);
  assertEquals(r.data.items[0].secret, undefined);
  assertEquals(r.data.nested.level1.level2.secret, undefined);
});

Deno.test("Multi-level wildcard (**) - timestamp fields", () => {
  const mockTool = createMockTool([], ["data.**.timestamp"], []);
  const result = postProcess(
    mockSpec,
    mockTool as unknown as Parameters<typeof postProcess>[1],
    testData,
  );

  // deno-lint-ignore no-explicit-any
  const r = result as Record<string, any>;
  assertEquals(r.data.nested.level1.level2.timestamp, undefined);
  assertEquals(r.data.stats.timestamp, undefined);
  assertEquals(r.data.nested.level1.level2.id, 100);
  assertEquals(r.data.stats.count, 2);
});

Deno.test("Combined wildcards - complex case", () => {
  const mockTool = createMockTool(
    [
      "data.items.*.id",
      "data.**.timestamp",
      "data.nested.level1.level2.secret",
    ],
    ["data.items.*.metadata.updated"],
    ["data.nested.level1.level2.secret"],
  );
  const result = postProcess(
    mockSpec,
    mockTool as unknown as Parameters<typeof postProcess>[1],
    testData,
  );

  // deno-lint-ignore no-explicit-any
  const r = result as Record<string, any>;
  assertEquals(r.data.items[0].id, 1);
  assertEquals(r.data.items[1].id, 2);
  assertEquals(r.data.nested.level1.level2.timestamp, "2023-03-01");
  assertEquals(r.data.stats.timestamp, "2023-04-01");
  assertEquals(r.data.items[0].metadata?.updated, undefined);
  assertEquals(r.data.items[1].metadata?.updated, undefined);
  assertEquals(r.data.nested.level1.level2.secret, SENSITIVE_MARK);
  assertEquals(r.data.items[0].name, undefined);
  assertEquals(r.data.stats.count, undefined);
});
