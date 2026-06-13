# Research Notes — Copilot Long-Term Memory (LTM)

> **Status**: 待调研  
> **Last Updated**: 2025-12-01

## 调研目标

1. 确定 GitHub Copilot 的 Long-Term Memory (LTM) 文件在各操作系统上的存储路径
2. 分析 LTM 文件的格式与结构（Markdown? JSON? 自定义格式?）
3. 理解 Session ID 的生成规则与仓库关联逻辑
4. 调查文件变更频率与监控策略

## 已知信息

### 可能的存储路径

| 操作系统 | 预期路径 |
|---------|---------|
| Windows | `%APPDATA%\GitHub Copilot\memory\` 或 `~/.copilot/` |
| macOS   | `~/Library/Application Support/GitHub Copilot/` |
| Linux   | `~/.config/github-copilot/` |

> ⚠️ 以上路径为推测，需要实际验证。

### 文件结构推测

```
memory/
├── <repo-hash-or-name>/
│   ├── <session-id>/
│   │   ├── memory-001.md
│   │   ├── memory-002.md
│   │   └── ...
│   └── metadata.json
└── ...
```

## TODO

- [ ] 在本地安装最新版 Copilot，启用 LTM 功能后观察文件系统变化
- [ ] 抓取实际的文件路径和目录结构
- [ ] 分析单个记忆文件的字段和格式
- [ ] 记录 Session ID 与 Git 仓库的映射关系
- [ ] 评估是否需要支持增量解析 / 文件监控（fs.watch）
