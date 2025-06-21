# OAPI Invoker MCP - Modular Architecture Summary

## 🏗️ Architecture Overview

我们成功地重构了 OAPI Invoker 的架构，实现了关注点分离，并创建了一个统一的值处理系统。

### 📁 文件结构

```
src/tool/
├── invoker.ts              # 主要的 API 调用逻辑
├── script-executor.ts      # 脚本执行和模板处理
├── value-processor.ts      # 值处理的统一接口
└── adapters/auth/          # 认证适配器

tests/
├── script-executor_test.ts # 脚本执行器测试
├── value-processor_test.ts # 值处理器测试
└── run-tests.ts           # 测试运行器
```

## 🔧 核心功能模块

### 1. Script Executor (`script-executor.ts`)
负责执行动态脚本和处理模板变量：

- **`executeScript()`**: 执行 Deno 脚本，支持完整权限
- **`processStringValue()`**: 处理字符串值（脚本或模板）
- **`processTemplateVariables()`**: 替换 `{VAR_NAME}` 模板变量
- **`headerKeyToEnvVar()`**: 转换头部键名为环境变量格式

### 2. Value Processor (`value-processor.ts`)
提供统一的值处理接口：

- **`processValue()`**: 递归处理任意类型值（字符串、对象、数组）
- **`processHeaders()`**: 处理头部，支持脚本间依赖
- **`processRequestValues()`**: 🆕 **统一处理函数**，替代原来的三个独立函数

### 3. Invoker (`invoker.ts`)
主要的 API 调用逻辑，现在使用模块化架构：

- 导入并使用 `processRequestValues()` 统一处理所有值
- 保持原有的 API 调用、认证、重试等功能
- 更清晰的代码结构

## ✨ 主要改进

### 🔄 统一的值处理
**之前**:
```typescript
requestHeaders = await processHeaders(requestHeaders);
pathParams = await processPathParams(pathParams);
inputParams = await processInputParams(inputParams);
```

**现在**:
```typescript
const processed = await processRequestValues(requestHeaders, pathParams, inputParams);
requestHeaders = processed.headers;
pathParams = processed.pathParams;
inputParams = processed.inputParams;
```

### 🎯 关注点分离
- **Script Executor**: 专注于脚本执行和模板处理
- **Value Processor**: 专注于值的递归处理和类型转换
- **Invoker**: 专注于 HTTP 请求和业务逻辑

### 🧪 完整的测试覆盖
- **17 个测试用例**全部通过
- 覆盖脚本执行、模板变量、环境变量传递等所有功能
- 自动化测试运行器

## 🚀 功能特性

### 1. 脚本执行
```typescript
const script = `#!/usr/bin/env deno
const timestamp = Date.now().toString();
Deno.stdout.write(new TextEncoder().encode(timestamp));`;
```

### 2. 模板变量
```typescript
"x-api-key": "{API_KEY}"  // 替换为环境变量值
```

### 3. 脚本间依赖
```typescript
"x-timestamp": "脚本生成时间戳",
"x-signature": "使用 x_timestamp 环境变量的脚本"
```

### 4. 递归处理
支持在嵌套对象和数组中的任意位置使用脚本：
```typescript
{
  user: {
    profile: {
      settings: {
        token: "#!/usr/bin/env deno ..." // 深层嵌套中的脚本
      }
    }
  }
}
```

## 📊 测试结果

```
🧪 Running OAPI Invoker MCP Tests

📝 Running tests/script-executor_test.ts...
✅ 12 tests passed

📝 Running tests/value-processor_test.ts...
✅ 5 tests passed

📊 Test Summary:
   Total Passed: 17
   Total Failed: 0

🎉 All tests passed!
```

## 🎯 使用示例

### 基本配置
```yaml
x-request-config:
  headers:
    "Content-Type": "application/json"
    "x-timestamp": |
      #!/usr/bin/env deno
      const timestamp = (Date.now()/1000).toFixed();
      Deno.stdout.write(new TextEncoder().encode(timestamp));
    "x-api-key": "{API_KEY}"
```

### 高级用法（签名生成）
```yaml
x-request-config:
  headers:
    "x-rio-signature": |
      #!/usr/bin/env deno
      import { encodeHex } from "jsr:@std/encoding/hex";
      const timestamp = Deno.env.get("x_rio_timestamp");
      const token = Deno.env.get("x_rio_paas_token") || "";
      const data = timestamp + token;
      const messageBuffer = new TextEncoder().encode(data);
      const hashBuffer = await crypto.subtle.digest("SHA-256", messageBuffer);
      const hash = encodeHex(hashBuffer);
      Deno.stdout.write(new TextEncoder().encode(hash));
```

## 🏆 总结

通过这次重构，我们实现了：

1. ✅ **关注点分离**: 每个模块有明确的职责
2. ✅ **代码复用**: 统一的 `processRequestValues()` 函数
3. ✅ **易于测试**: 模块化设计便于单元测试
4. ✅ **易于维护**: 清晰的文件结构和功能划分
5. ✅ **功能完整**: 支持脚本执行、模板变量、环境变量传递等所有原有功能

这个架构为未来的功能扩展和维护提供了良好的基础。
