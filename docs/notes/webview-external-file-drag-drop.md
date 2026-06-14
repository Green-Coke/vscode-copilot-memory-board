# Webview 外部文件拖拽导入实现指南

## 概述

在 VS Code Webview 中实现"从桌面拖拽文件到扩展 UI"的功能，
使用 HTML5 的 `DataTransfer` API 读取拖入的文件内容，
然后通过 postMessage 协议将文件数据（base64 编码）发送给扩展端写入磁盘。

## 实现架构

```
桌面/资源管理器 → HTML5 onDrop → DataTransfer.files → arrayBuffer → base64
→ postMessage(importExternalFile) → 扩展端 → vscode.workspace.fs.writeFile
```

## 关键代码

### 1. 容器上注册原生 HTML5 事件

```tsx
<div
  onDragOver={handleDragOver}
  onDragLeave={handleDragLeave}
  onDrop={handleDrop}
>
  {/* 文件树内容 */}
</div>
```

### 2. DragOver 处理 — 区分内部拖拽和外部文件

```typescript
const handleDragOver = (e: React.DragEvent) => {
  // 检查是否是外部文件（而非内部 dnd-kit 拖拽）
  if (e.dataTransfer.types.includes('Files')) {
    e.preventDefault();  // 必须 preventDefault 才能触发 drop
    e.stopPropagation();
    setIsExternalDragOver(true);
  }
};
```

### 3. Drop 处理 — 读取文件并发送到扩展端

```typescript
const handleDrop = async (e: React.DragEvent) => {
  e.preventDefault();
  const files = e.dataTransfer.files;
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) continue;
    
    // 大小校验（30MB 上限）
    if (file.size > 30 * 1024 * 1024) {
      console.warn(`文件过大，已跳过：${file.name}`);
      continue;
    }
    
    // 读取文件内容并转为 base64
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let j = 0; j < uint8Array.length; j++) {
      binary += String.fromCharCode(uint8Array[j] ?? 0);
    }
    const contentBase64 = btoa(binary);
    
    // 通过协议发送给扩展端
    await sendRequest('importExternalFile', {
      targetDir: '/target/directory',
      name: file.name,
      contentBase64,
      sizeBytes: file.size,
    });
  }
};
```

## 与 @dnd-kit 内部拖拽的共存

Memory Board 同时使用 `@dnd-kit/core` 进行内部节点拖拽（移动文件）和
HTML5 原生事件进行外部文件导入。两者的区分方式：

- **@dnd-kit 内部拖拽**：`e.dataTransfer.types` 不含 `'Files'`
- **外部文件拖入**：`e.dataTransfer.types` 包含 `'Files'`

## 注意事项

### 大文件限制
- GUI 端校验：`file.size > 30MB` 则跳过
- 扩展端二次校验：`sizeBytes > 30MB` 则拒接并返回错误
- base64 编码后体积约为原始大小的 4/3

### Webview CSP 限制
外部拖入的文件通过 `file.arrayBuffer()` 读取内容，
这是浏览器原生 API，不受 CSP 限制。

### DragLeave 防抖
DragLeave 事件在鼠标移入子元素时也会触发，需要用
`containerRef.contains(e.relatedTarget)` 判断是否真正离开了容器。
