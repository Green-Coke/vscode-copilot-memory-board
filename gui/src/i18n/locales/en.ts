// ============================================================================
// i18n — English translation resources
// ============================================================================
// 扁平键命名（按区域 common/sort/filter/workspaces/sessions/memory/preview/
// layout/pinned/errorBoundary）。
// 翻译策略：
//  - 术语对齐 VS Code 原生（Reveal in Explorer / Copy Path 等）
//  - Stable/Insiders/Disabled 直接用 VS Code 原生命名，去掉括注
//  - 所有插值用 i18next 原生 {name} / {count} 语法，不引入 ICU 插件
// ============================================================================

const en = {
  // 通用动作（右键菜单 / 按钮）
  common: {
    copy: "Copy",
    cut: "Cut",
    paste: "Paste",
    delete: "Delete",
    rename: "Rename",
    newFolder: "New Folder",
    copyPath: "Copy Path",
    revealInExplorer: "Reveal in Explorer",
    resetFilter: "Reset filter",
    closePreview: "Close preview",
    loadMore: "Load more ({{count}} remaining)",
    unpin: "Unpin",
    pinToTop: "Pin to top",
    directoryEmpty: "Directory is empty",
    draggingHint: "📦 Moving...",
  },

  // 排序控件
  sort: {
    field: {
      name: "Name",
      created: "Created",
      updated: "Updated",
    },
    aria: "Sort by",
    tooltip: {
      ascending: "Ascending (↑ highlighted), click to switch to descending",
      descending: "Descending (↓ highlighted), click to switch to ascending",
    },
  },

  // 过滤器
  filter: {
    aria: "Filter",
  },

  // 工作区面板
  workspaces: {
    title: "Workspaces",
    empty: {
      title: "No Workspaces",
      hint: "After using Copilot Chat in this workspace, memories will sync here automatically.",
    },
    noMatch: "No matching workspaces",
    search: {
      aria: "Search workspaces",
    },
    filter: {
      onlyWithMemories: "Only show workspaces with memories",
    },
    ide: {
      stable: "Stable",
      insiders: "Insiders",
      disabled: "Disabled",
      tooltip: "Quickly switch between Stable and Insiders Copilot memory cache",
    },
    collapse: {
      disabled: "Cannot collapse without selecting a workspace",
      expand: "Expand workspace panel",
      collapse: "Collapse workspace panel",
    },
    menu: {
      copyProjectPath: "Copy Project Path",
      copyStoragePath: "Copy Storage Path",
      revealProject: "Reveal Project in Explorer",
      revealStorage: "Reveal Storage in Explorer",
    },
  },

  // 会话面板
  sessions: {
    search: {
      aria: "Search sessions",
    },
    filter: {
      onlyWithEntries: "Only show sessions with entries",
    },
    empty: {
      selectWorkspace: {
        title: "Select a Workspace",
        hint: "Select a workspace from the left panel to scan its session memories.",
      },
      none: {
        title: "No Sessions Found",
        hint: "No Copilot Chat memory timeline found in {{workspaceName}}.",
      },
    },
    workspaceDirectory: {
      title: "Workspace Directory",
      hint: "Click to view workspace memory files",
      viewTooltip: "View workspace file directory",
    },
    menu: {
      copyPath: "Copy Path",
      revealInExplorer: "Reveal in Explorer",
    },
  },

  // 记忆视图面板
  memory: {
    empty: {
      title: "Select a Session",
      hint: "Select a session from the middle panel to render its file snapshot here.",
    },
    search: {
      aria: "Filter files",
      clear: "Clear search",
    },
    preview: {
      enable: "Enable file preview",
      disable: "Disable file preview",
    },
  },

  // 文件预览面板
  preview: {
    empty: {
      directoryTitle: "Directory Selected",
      fileTitle: "No File Selected",
      directoryHint: "This directory has no previewable content. Select a specific file to view its contents.",
      fileHint: "Select a text or image file from the file tree on the left to preview its contents here.",
    },
    unsupported: {
      title: "Unsupported format",
      hint: "File {{name}} is a binary or unrecognized proprietary format and cannot be displayed as text here.",
    },
    disabled: {
      title: "Preview disabled",
      message: "File preview is currently disabled. Toggle it back on via the switch at the top of the panel.",
    },
    collapsed: {
      title: "Preview collapsed",
      hint: "Click a file on the left to expand the preview panel again.",
    },
  },

  // 大屏布局相关
  layout: {
    back: "Go back",
    workspaceSelect: {
      placeholder: "Select a workspace…",
    },
    switchWorkspaceTitle: "Switch Workspace",
  },

  // 钉选按钮
  pinned: {
    unpin: "Unpin",
    pinToTop: "Pin to top",
  },

  // 错误边界
  errorBoundary: {
    title: "Panel render failed",
    message: "An error occurred during rendering. This is usually caused by a data format issue (e.g. an older extension or standalone server returning incompatible fields). Restarting the standalone dev server typically resolves it.",
    retry: "Retry",
  },
} as const;

export default en;
