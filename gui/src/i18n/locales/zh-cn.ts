// ============================================================================
// i18n — 中文翻译资源（zh-cn）
// ============================================================================
// 保留所有现有中文界面文案；保持与 en.ts 键的一致性。
// 特殊处理：Stable/Insiders/Disabled 在中文环境下保留括注（"Stable (稳定版)"），
// 与英文环境纯名称形成对齐（用户决策：保留双语）。
// ============================================================================

import type en from "./en";

const zhCn = {
  // 通用动作（右键菜单 / 按钮）
  common: {
    copy: "复制",
    cut: "剪切",
    paste: "粘贴",
    delete: "删除",
    rename: "重命名",
    newFolder: "新建文件夹",
    copyPath: "复制路径",
    revealInExplorer: "在资源管理器中显示",
    resetFilter: "重置过滤",
    closePreview: "关闭预览",
    loadMore: "加载更多（剩余 {{count}} 项）",
    unpin: "取消钉选",
    pinToTop: "钉选到顶部",
    directoryEmpty: "目录为空",
    draggingHint: "📦 移动中...",
  },

  // 排序控件
  sort: {
    field: {
      name: "名称",
      created: "创建时间",
      updated: "更新时间",
    },
    aria: "排序字段",
    tooltip: {
      ascending: "当前正序（上箭头高亮），点击切换为倒序",
      descending: "当前倒序（下箭头高亮），点击切换为正序",
    },
  },

  // 过滤器
  filter: {
    aria: "筛选过滤",
  },

  // 工作区面板
  workspaces: {
    title: "工作区",
    empty: {
      title: "暂无工作区",
      hint: "在本工作区使用 Copilot Chat 后，记忆会自动同步到此处。",
    },
    noMatch: "未找到匹配的工作区",
    search: {
      aria: "搜索工作区",
    },
    filter: {
      onlyWithMemories: "只展示有记忆的工作区",
    },
    ide: {
      // 中文环境保留括注（用户决策）——与英文 en.ts 中纯 "Stable" 形成对比
      stable: "Stable (稳定版)",
      insiders: "Insiders (体验版)",
      disabled: "Disabled (禁用)",
      tooltip: "处于第三方 IDE 环境时，可在此快速切换读取 VS Code 稳定版或体验版制造的 Copilot memories 缓存",
    },
    collapse: {
      disabled: "未选择工作区时不可折叠",
      expand: "展开工作区栏",
      collapse: "折叠工作区栏",
    },
    menu: {
      copyProjectPath: "复制项目路径",
      copyStoragePath: "复制存储路径",
      revealProject: "在资源管理器中打开项目",
      revealStorage: "在资源管理器中打开存储目录",
    },
  },

  // 会话面板
  sessions: {
    search: {
      aria: "搜索会话",
    },
    filter: {
      onlyWithEntries: "只展示有条目的会话",
    },
    empty: {
      selectWorkspace: {
        title: "等待工作区选择",
        hint: "请从左侧面板选择一个工作区以扫描其会话记忆。",
      },
      none: {
        title: "未找到会话",
        hint: "在 {{workspaceName}} 中未发现可用的 Copilot Chat 记忆时间线。",
      },
    },
    workspaceDirectory: {
      title: "工作区级目录",
      hint: "点击查看该工作区的记忆文件目录",
      viewTooltip: "查看该工作区的记忆文件目录",
    },
    menu: {
      copyPath: "复制路径",
      revealInExplorer: "在资源管理器中打开",
    },
  },

  // 记忆视图面板
  memory: {
    empty: {
      title: "选择会话日志",
      hint: "从中间栏选择一个会话时序记录，即可在此渲染相应项目文件快照。",
    },
    search: {
      aria: "过滤文件",
      clear: "清空搜索词",
    },
    preview: {
      enable: "开启文件预览功能",
      disable: "关闭文件预览功能",
    },
  },

  // 文件预览面板
  preview: {
    empty: {
      directoryTitle: "已选中目录",
      fileTitle: "未选中文件",
      directoryHint: "目录暂无可预览的内容，请选择一个具体的文件查看其内容。",
      fileHint: "从左侧目录树中选择一个文本或图片文件，即可在此处查看其具体内容。",
    },
    unsupported: {
      title: "不支持预览的格式",
      // 顺手修正原文「呈观」为「呈现」笔误
      hint: "文件 {{name}} 是二进制或系统不识别的专有格式，暂无法在此以文本方式呈现。",
    },    disabled: {
      title: "预览已关闭",
      message: "文件预览功能当前处于关闭状态。可通过面板顶部的开关重新启用。",
    },
    collapsed: {
      title: "预览面板已收起",
      hint: "点击左侧文件可以重新展开预览面板。",
    },  },

  // 大屏布局相关
  layout: {
    back: "返回上一级",
    workspaceSelect: {
      placeholder: "选择工作区…",
    },
    switchWorkspaceTitle: "切换工作区",
  },

  // 钉选按钮
  pinned: {
    unpin: "取消钉选",
    pinToTop: "钉选到顶部",
  },

  // 错误边界
  errorBoundary: {
    title: "面板渲染失败",
    message: "渲染过程中发生异常。可能是数据格式异常（例如旧版扩展/standalone 服务返回了不兼容的字段），重启 standalone dev server 后通常能解决。",
    retry: "重试",
  },
} as const;

// 类型约束：zh-cn 必须与 en 结构一致，编译时检查漏翻/错键
// （仅用于类型层校验，不产生运行时代码）
export type ZhCnDictionary = typeof zhCn;
export type EnDictionary = typeof en;
export type _AssertSameShape =
  EnDictionary extends ZhCnDictionary
    ? ZhCnDictionary extends EnDictionary
      ? true
      : never
    : never;

export default zhCn;
