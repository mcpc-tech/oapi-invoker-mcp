import { assertEquals } from "jsr:@std/assert";
import { postProcess } from "../src/tool/invoker.ts";

// Mock the necessary objects for testing
const mockSpec = {} as any;
const createMockTool = (includeKeys: string[] = [], excludeKeys: string[] = [], sensitiveKeys: string[] = []) => {
  return {
    _rawOperation: {
      "x-include-response-keys": includeKeys,
      "x-exclude-response-keys": excludeKeys,
      "x-sensitive-response-fields": sensitiveKeys
    }
  };
};

// Test data
const testData = {
  data: {
    items: [
      { id: 1, name: "Item 1", secret: "password1", metadata: { created: "2023-01-01", updated: "2023-01-02" } },
      { id: 2, name: "Item 2", secret: "password2", metadata: { created: "2023-02-01", updated: "2023-02-02" } }
    ],
    nested: {
      level1: {
        level2: {
          id: 100,
          secret: "top-secret",
          timestamp: "2023-03-01"
        }
      }
    },
    stats: {
      count: 2,
      timestamp: "2023-04-01"
    }
  }
};

// Tests
Deno.test("Single-level wildcard (*) - exclude keys", () => {
  const mockTool = createMockTool([], ["data.items.*.secret"], []);
  const result = postProcess(mockSpec, mockTool as any, testData);
  
  // Check that secrets are excluded from all items
  assertEquals((result as any).data.items[0].secret, undefined);
  assertEquals((result as any).data.items[1].secret, undefined);
  
  // Check that other fields are preserved
  assertEquals((result as any).data.items[0].id, 1);
  assertEquals((result as any).data.items[0].name, "Item 1");
  assertEquals((result as any).data.items[1].id, 2);
  assertEquals((result as any).data.items[1].name, "Item 2");
});

Deno.test("Single-level wildcard (*) - include keys", () => {
  const mockTool = createMockTool(["data.items.*.id", "data.items.*.name"], [], []);
  const result = postProcess(mockSpec, mockTool as any, testData);
  
  // Check that only specified fields are included
  assertEquals((result as any).data.items[0].id, 1);
  assertEquals((result as any).data.items[0].name, "Item 1");
  assertEquals((result as any).data.items[0].secret, undefined);
  assertEquals((result as any).data.items[1].id, 2);
  assertEquals((result as any).data.items[1].name, "Item 2");
  assertEquals((result as any).data.items[1].secret, undefined);
  
  // Check that other parts of the object are not included
  assertEquals((result as any).data.nested, undefined);
  assertEquals((result as any).data.stats, undefined);
});

Deno.test("Single-level wildcard (*) - sensitive fields", () => {
  const SENSITIVE_MARK = "*SENSITIVE*";
  const mockTool = createMockTool([], [], ["data.items.*.secret"]);
  const result = postProcess(mockSpec, mockTool as any, testData);
  
  // Check that secrets are masked
  assertEquals((result as any).data.items[0].secret, SENSITIVE_MARK);
  assertEquals((result as any).data.items[1].secret, SENSITIVE_MARK);
  
  // Check that other fields are preserved
  assertEquals((result as any).data.items[0].id, 1);
  assertEquals((result as any).data.items[0].name, "Item 1");
});

Deno.test("Non wildcard - sensitive fields", () => {
  const SENSITIVE_MARK = "*SENSITIVE*";
  const mockTool = createMockTool([], [], ["secret"]);
  const result = postProcess(mockSpec, mockTool as any, testData);
  
  // Check that secrets are masked
  assertEquals((result as any).data.items[0].secret, SENSITIVE_MARK);
  assertEquals((result as any).data.items[1].secret, SENSITIVE_MARK);
  
  // Check that other fields are preserved
  assertEquals((result as any).data.items[0].id, 1);
  assertEquals((result as any).data.items[0].name, "Item 1");
});

Deno.test("Multi-level wildcard (**) - sensitive fields", () => {
  const SENSITIVE_MARK = "*SENSITIVE*";
  const mockTool = createMockTool([], [], ["**.secret"]);
  const result = postProcess(mockSpec, mockTool as any, testData);
  
  // Check that secrets are masked
  assertEquals((result as any).data.items[0].secret, SENSITIVE_MARK);
  assertEquals((result as any).data.items[1].secret, SENSITIVE_MARK);
  
  // Check that other fields are preserved
  assertEquals((result as any).data.items[0].id, 1);
  assertEquals((result as any).data.items[0].name, "Item 1");
});

Deno.test("Multi-level wildcard (**) - sensitive fields", () => {
  const SENSITIVE_MARK = "*SENSITIVE*";
  // 不使用 includeKeys，这样可以测试在不指定包含键的情况下敏感字段掩码是否正常工作
  const mockTool = createMockTool([], [], ["data.**.secret"]);
  const result = postProcess(mockSpec, mockTool as any, testData);
  
  // 检查所有层级的 secret 字段是否都被掩码
  assertEquals((result as any).data.items[0].secret, SENSITIVE_MARK);
  assertEquals((result as any).data.items[1].secret, SENSITIVE_MARK);
  assertEquals((result as any).data.nested.level1.level2.secret, SENSITIVE_MARK);
  
  // 检查其他字段是否保持不变
  assertEquals((result as any).data.items[0].id, 1);
  assertEquals((result as any).data.items[0].name, "Item 1");
  assertEquals((result as any).data.nested.level1.level2.id, 100);
  assertEquals((result as any).data.nested.level1.level2.timestamp, "2023-03-01");
});

Deno.test("Multi-level wildcard (**) - exclude keys", () => {
  const mockTool = createMockTool([], ["data.**.secret"], []);
  const result = postProcess(mockSpec, mockTool as any, testData);
  
  // Check that all secrets at any level are excluded
  assertEquals((result as any).data.items[0].secret, undefined);
  assertEquals((result as any).data.items[1].secret, undefined);
  assertEquals((result as any).data.nested.level1.level2.secret, undefined);
  
  // Check that other fields are preserved
  assertEquals((result as any).data.items[0].id, 1);
  assertEquals((result as any).data.nested.level1.level2.id, 100);
});

Deno.test("Multi-level wildcard (**) - include keys", () => {
  const mockTool = createMockTool(["data.**.id"], [], []);
  const result = postProcess(mockSpec, mockTool as any, testData);
  
  // Check that only IDs at any level are included
  assertEquals((result as any).data.items[0].id, 1);
  assertEquals((result as any).data.items[1].id, 2);
  assertEquals((result as any).data.nested.level1.level2.id, 100);
  
  // Check that other fields are not included
  assertEquals((result as any).data.items[0].name, undefined);
  assertEquals((result as any).data.items[0].secret, undefined);
  assertEquals((result as any).data.nested.level1.level2.secret, undefined);
});

Deno.test("Multi-level wildcard (**) - timestamp fields", () => {
  const mockTool = createMockTool([], ["data.**.timestamp"], []);
  const result = postProcess(mockSpec, mockTool as any, testData);
  
  // Check that all timestamp fields at any level are excluded
  assertEquals((result as any).data.nested.level1.level2.timestamp, undefined);
  assertEquals((result as any).data.stats.timestamp, undefined);
  
  // Check that other fields are preserved
  assertEquals((result as any).data.nested.level1.level2.id, 100);
  assertEquals((result as any).data.stats.count, 2);
});

Deno.test("Combined wildcards - complex case", () => {
  const mockTool = createMockTool(
    ["data.items.*.id", "data.**.timestamp", "data.nested.level1.level2.secret"], // 添加敏感字段路径到 includeKeys
    ["data.items.*.metadata.updated"], 
    ["data.nested.level1.level2.secret"] // 使用具体路径而不是通配符
  );
  const result = postProcess(mockSpec, mockTool as any, testData);
  
  // Check include keys
  assertEquals((result as any).data.items[0].id, 1);
  assertEquals((result as any).data.items[1].id, 2);
  assertEquals((result as any).data.nested.level1.level2.timestamp, "2023-03-01");
  assertEquals((result as any).data.stats.timestamp, "2023-04-01");
  
  // Check exclude keys
  assertEquals((result as any).data.items[0].metadata?.updated, undefined);
  assertEquals((result as any).data.items[1].metadata?.updated, undefined);
  
  // Check sensitive keys
  assertEquals((result as any).data.nested.level1.level2.secret, "*SENSITIVE*");
  
  // Check that non-specified fields are not included
  assertEquals((result as any).data.items[0].name, undefined);
  assertEquals((result as any).data.stats.count, undefined);
});