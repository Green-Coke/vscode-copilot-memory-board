# VS Code API 功能使用指南：文档的打开与展示

本文档总结了在 VS Code 扩展（Extension）开发中，如何通过 VS Code 官方 API 打开物理磁盘上的文件或直接创建并展示临时的虚拟（未存盘）文本内容。

---

## 核心 API 介绍

在 VS Code 模式中，要实现“在编辑器中打开文件”需要结合两个核心的 API 分工协作：

### 1. `vscode.workspace.openTextDocument`
此 API 用于将文件内容**加载进内存**（工作区），但**不会**主动在界面上渲染编辑器。它支持两种调用模式：

*   **物理路径加载**：传入一个包含绝对路径的 `vscode.Uri`。
    ```typescript
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file('/absolute/path/file.ts'));
    ```
*   **虚拟内存加载 (Untitled)**：对于本地磁盘不存在的模拟文件或需要初始化默认文本的新文档，可传入一个属性对象：
    *   `content`: 文本内容。
    *   `language`: 指示语法高亮和编辑器模式的语言标识符。
    ```typescript
    const doc = await vscode.workspace.openTextDocument({
      content: '// 示例代码内容',
      language: 'typescriptreact'
    });
    ```

### 2. `vscode.window.showTextDocument`
此 API 用于在 VS Code 编辑器窗口中**显示（激活）**一个已经被加载进内存的 `TextDocument` 对象。

```typescript
await vscode.window.showTextDocument(doc, {
  preview: true,       // 如果设为 true（预览模式），新打开的文档会重用当前预览编辑器标签页，防止无限创建新标签页。
  preserveFocus: false // 设为 false 表示在打开文档后，光标和焦点会自动移动到该编辑器窗口中。
});
```

---

## 常见语言标识符 (Language Identifiers)

当通过虚拟内存加载 Untitled 文档时，VS Code 需要明确的语言标识符来加载对应高亮。以下是开发中常用的后缀名与语言标识符对照表：

| 文件后缀 | 语言类型 | VS Code 语言标识符 (Language ID) |
| :--- | :--- | :--- |
| `.ts` | TypeScript | `typescript` |
| `.tsx` | TypeScript React | `typescriptreact` |
| `.js` | JavaScript | `javascript` |
| `.jsx` | JavaScript React | `javascriptreact` |
| `.json` | JSON 配置 | `json` |
| `.md` | Markdown 标记 | `markdown` |
| `.css` | CSS 样式表 | `css` |
| `.html` | HTML 网页 | `html` |
| `.txt` | 纯文本 | `plaintext` |

---

## 最佳实践案例

在编写桥接消息处理或命令回调时，通常将它们组合成一个健壮的异步函数。同时考虑真实文件和 Mock 内容的兼容情况：

```typescript
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * 在 VS Code 中打开并显示对应文件
 * @param name 文件名
 * @param content 文件内容
 * @param filePath 物理文件绝对路径（如果有的话）
 */
async function openDocument(name: string, content: string, filePath?: string): Promise<void> {
  // 1. 优先尝试打开真实存在的物理文件
  if (filePath && fs.existsSync(filePath)) {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    await vscode.window.showTextDocument(doc, { preview: true });
    return;
  }

  // 2. 根据文件名后缀推断 Language ID
  const ext = path.extname(name).toLowerCase();
  let language: string | undefined;
  switch (ext) {
    case '.tsx': language = 'typescriptreact'; break;
    case '.ts':  language = 'typescript'; break;
    case '.jsx': language = 'javascriptreact'; break;
    case '.js':  language = 'javascript'; break;
    case '.md':  language = 'markdown'; break;
    case '.json': language = 'json'; break;
    case '.css': language = 'css'; break;
    case '.html': language = 'html'; break;
    case '.txt': language = 'plaintext'; break;
  }

  // 3. 回退方案：加载虚拟 Untitled 文档
  const doc = await vscode.workspace.openTextDocument({
    content: content,
    language: language
  });
  
  // 4. 显示到编辑器（使用 preview 选项复用标签页）
  await vscode.window.showTextDocument(doc, { preview: true });
}
```
