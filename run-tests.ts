#!/usr/bin/env deno

/**
 * Simple test runner for the OAPI Invoker MCP
 * Runs all tests and provides a summary
 */

console.log("🧪 Running OAPI Invoker MCP Tests\n");

const tests = [
  "tests/script-executor_test.ts",
  "tests/value-processor_test.ts"
];

let totalPassed = 0;
let totalFailed = 0;
let allTestsSuccess = true;

for (const testFile of tests) {
  console.log(`📝 Running ${testFile}...`);
  
  const command = new Deno.Command("deno", {
    args: ["test", "--allow-all", testFile],
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout, stderr } = await command.output();
  const output = new TextDecoder().decode(stdout);
  const errorOutput = new TextDecoder().decode(stderr);

  if (code === 0) {
    // Parse the output to get test counts
    const match = output.match(/ok \| (\d+) passed \| (\d+) failed/);
    if (match) {
      const passed = parseInt(match[1]);
      const failed = parseInt(match[2]);
      totalPassed += passed;
      totalFailed += failed;
      console.log(`✅ ${passed} passed, ${failed} failed\n`);
    } else {
      // Try to count tests from running lines
      const runningLines = output.match(/running (\d+) tests from/);
      if (runningLines) {
        const testCount = parseInt(runningLines[1]);
        totalPassed += testCount;
        console.log(`✅ ${testCount} tests passed\n`);
      } else {
        console.log("✅ Tests completed successfully\n");
      }
    }
  } else {
    allTestsSuccess = false;
    console.log(`❌ Tests failed:`);
    console.log(errorOutput || output);
    console.log();
  }
}

// Print summary
console.log("📊 Test Summary:");
console.log(`   Total Passed: ${totalPassed}`);
console.log(`   Total Failed: ${totalFailed}`);

if (allTestsSuccess && totalFailed === 0) {
  console.log("\n🎉 All tests passed! The script execution and value processing functionality is working correctly.");
  Deno.exit(0);
} else {
  console.log("\n❌ Some tests failed. Please check the output above.");
  Deno.exit(1);
}
