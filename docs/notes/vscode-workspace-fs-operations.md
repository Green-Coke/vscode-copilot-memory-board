# vscode.workspace.fs 文件操作 API 使用指南

## 概述

`vscode.workspace.fs` 是 VS Code 提供的文件系统 API，用于在扩展中安全地执行文件操作。
相比直接使用 Node.js `fs` 模块，`workspace.fs` 有以下优势：
- **统一接口**：兼容本地文件系统和远程文件系统（如 SSH Remote、WSL）
- **URI-based**：使用 `vscode.Uri` 而非字符串路径，更安全
- **权限控制**：受 VS Code 沙箱限制，安全性更高

## Memory Board 中的使用场景

### 1. 复制文件/目录
```typescript
// copy(source, target, options) — 复制文件或目录
await vscode.workspace.fs.copy(
  vscode.Uri.file('/path/to/source.md'),
  vscode.Uri.file('/path/to/target.md'),
  { overwrite: false }  // overwrite: false 时同名文件会抛 FileExists 错误
);
```

### 2. 移动/重命名文件
```typescript
// rename(source, target, options) — 移动或重命名
// 注意："重命名"和"移动"使用同一个 API
await vscode.workspace.fs.rename(
  vscode.Uri.file('/path/to/old-name.md'),
  vscode.Uri.file('/path/to/new-name.md'),
  { overwrite: false }
);
```

### 3. 删除文件/目录
```typescript
// delete(uri, options) — 删除文件或目录
await vscode.workspace.fs.delete(vscode.Uri.file('/path/to/file'), {
  recursive: true,    // 递归删除（目录必须为 true）
  useTrash: true,     // 移至系统回收站而非永久删除
});
```

### 4. 创建目录
```typescript
// createDirectory(uri) — 创建目录（递归创建中间目录）
await vscode.workspace.fs.createDirectory(
  vscode.Uri.file('/path/to/new/directory')
);
```

### 5. 写入文件内容
```typescript
// writeFile(uri, content) — 写入二进制内容
const content = Buffer.from(base64String, 'base64');
await vscode.workspace.fs.writeFile(
  vscode.Uri.file('/path/to/file.md'),
  new Uint8Array(content)
);
```

### 6. 检查文件是否存在
```typescript
// stat(uri) — 获取文件信息；文件不存在时抛 FileNotFound 错误
try {
  const stat = await vscode.workspace.fs.stat(vscode.Uri.file('/path'));
  // 文件存在
} catch {
  // 文件不存在
}
```

## 关键注意事项

### 同名文件处理
当 `overwrite: false` 时，如果目标已存在同名文件，`copy` 和 `rename` 会抛出 `FileExists` 错误。
Memory Board 通过 `ensureUniquePath()` 辅助方法自动追加 " - Copy" 后缀来规避此问题。

### useTrash 参数
`useTrash: true` 将文件移至系统回收站，用户可以从回收站恢复。
这是 Memory Board 删除操作的默认行为，符合"安全删除"原则。

### 循环移动检测
移动文件夹时需检测目标目录是否在源目录的子树下，防止循环引用：
```typescript
const rel = path.relative(sourcePath, targetDir);
if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
  throw new Error('不能将文件夹移动到其自身子目录下');
}
```

### 在系统资源管理器中显示
```typescript
// 使用内置命令 revealFileInOS
await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(filePath));
```

### 复制路径到剪贴板
```typescript
await vscode.env.clipboard.writeText(filePath);
```
