import { assertEquals } from "@std/assert";
import { processRequestValues } from "../src/tool/value-processor.ts";

Deno.test("processRequestValues - handles static values", async () => {
  const headers = { "Content-Type": "application/json" };
  const pathParams = { userId: "123" };
  const inputParams = { name: "John" };

  const result = await processRequestValues(headers, pathParams, inputParams);

  assertEquals(result.headers["Content-Type"], "application/json");
  assertEquals(result.pathParams.userId, "123");
  assertEquals(result.inputParams.name, "John");
});

Deno.test("processRequestValues - handles template variables", async () => {
  Deno.env.set("TEST_VAR", "test-value");

  const headers = { "x-api-key": "{TEST_VAR}" };
  const pathParams = { endpoint: "api/{TEST_VAR}" };
  const inputParams = { token: "{TEST_VAR}" };

  const result = await processRequestValues(headers, pathParams, inputParams);

  assertEquals(result.headers["x-api-key"], "test-value");
  assertEquals(result.pathParams.endpoint, "api/test-value");
  assertEquals(result.inputParams.token, "test-value");

  Deno.env.delete("TEST_VAR");
});

Deno.test("processRequestValues - executes scripts", async () => {
  const script = `#!/usr/bin/env deno
Deno.stdout.write(new TextEncoder().encode("script-result"));`;

  const headers = { "x-dynamic": script };
  const pathParams = { id: "123" };
  const inputParams = { value: script };

  const result = await processRequestValues(headers, pathParams, inputParams);

  assertEquals(result.headers["x-dynamic"], "script-result");
  assertEquals(result.pathParams.id, "123");
  assertEquals(result.inputParams.value, "script-result");
});

Deno.test("processRequestValues - handles nested objects", async () => {
  const script = `#!/usr/bin/env deno
Deno.stdout.write(new TextEncoder().encode("nested-result"));`;

  const inputParams = {
    user: {
      profile: {
        settings: { script },
      },
    },
  };

  const result = await processRequestValues({}, {}, inputParams);

  const user = result.inputParams.user as Record<string, unknown>;
  const profile = user.profile as Record<string, unknown>;
  const settings = profile.settings as Record<string, unknown>;
  assertEquals(settings.script, "nested-result");
});

Deno.test("processRequestValues - header environment variables", async () => {
  const headers = {
    "x-first": `#!/usr/bin/env deno
Deno.stdout.write(new TextEncoder().encode("first-value"));`,
    "x-second": `#!/usr/bin/env -S deno run --allow-env
const firstValue = Deno.env.get("x_first") || "not-found";
Deno.stdout.write(new TextEncoder().encode("second-" + firstValue));`,
  };

  const result = await processRequestValues(headers, {}, {});

  assertEquals(result.headers["x-first"], "first-value");
  assertEquals(result.headers["x-second"], "second-first-value");
});

Deno.test("processRequestValues - inputParams with Node.js encodeURIComponent", async () => {
  const inputParams = {
    rawQuery: "hello world & special chars",
    encodedQuery: `#!/usr/bin/env node
const rawValue = "hello world & special chars";
const encoded = encodeURIComponent(rawValue);
process.stdout.write(encoded);`,
    staticValue: "unchanged",
  };

  const result = await processRequestValues({}, {}, inputParams);

  assertEquals(result.inputParams.rawQuery, "hello world & special chars");
  assertEquals(
    result.inputParams.encodedQuery,
    "hello%20world%20%26%20special%20chars",
  );
  assertEquals(result.inputParams.staticValue, "unchanged");
});

Deno.test("processRequestValues - inputParams with Deno URL encoding", async () => {
  const inputParams = {
    searchParams: {
      query: `#!/usr/bin/env deno
const searchTerm = "user search & query";
const encoded = encodeURIComponent(searchTerm);
Deno.stdout.write(new TextEncoder().encode(encoded));`,
      page: "1",
    },
  };

  const result = await processRequestValues({}, {}, inputParams);

  const searchParams = result.inputParams.searchParams as Record<
    string,
    unknown
  >;
  assertEquals(typeof searchParams.query, "string");
  assertEquals((searchParams.query as string).includes("%"), true);
  assertEquals(searchParams.page, "1");
});
