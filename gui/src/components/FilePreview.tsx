import React from "react";
import { FileText, FileImage, ShieldAlert, FileCode2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MockFsNode } from "@/lib/mock-filetree";

/**
 * 文件预览组件 Props
 */
interface FilePreviewProps {
  /** 当前选中的文件节点，为 null 时展示占位提示 */
  node: MockFsNode | null;
}

/**
 * 文件预览展示组件，根据选中的文件节点类型展示文本、图片或占位提示
 */
export function FilePreview({ node }: FilePreviewProps) {
  // 未选择文件时的占位状态
  if (!node) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-surface-2/10">
        <div className="relative w-16 h-16 mb-4 flex items-center justify-center text-text-muted/40">
          <svg viewBox="0 0 100 100" className="w-12 h-12" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="25" y="20" width="50" height="60" rx="5" />
            <line x1="35" y1="35" x2="65" y2="35" />
            <line x1="35" y1="50" x2="65" y2="50" />
            <line x1="35" y1="65" x2="55" y2="65" />
          </svg>
          <FileCode2 className="absolute w-4 h-4 text-brand-indigo animate-pulse" />
        </div>
        <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider font-display">
          未选中文件
        </h3>
        <p className="text-[11px] text-text-muted mt-1 max-w-[200px] leading-relaxed">
          从左侧目录树中选择一个文本或图片文件，即可在此处查看其具体内容。
        </p>
      </div>
    );
  }

  // 渲染文本/代码预览
  if (node.fileType === "text") {
    return (
      <div className="flex flex-col h-full bg-surface-2/20 relative animate-fade-in">
        {/* 文件头信息栏 */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle bg-surface-2/40 select-none">
          <span className="text-[10px] font-mono font-semibold text-text-secondary flex items-center gap-1.5 truncate">
            <FileText className="w-3.5 h-3.5 text-brand-indigo" />
            {node.name}
          </span>
          <span className="text-[9px] font-mono text-text-muted uppercase">
            TEXT / CODE
          </span>
        </div>
        
        {/* 代码内容区域 */}
        <div className="flex-1 overflow-auto p-4 select-text selection:bg-brand-indigo/30">
          <pre className="font-mono text-xs text-text-primary leading-relaxed whitespace-pre-wrap break-all bg-surface-2/30 p-4 rounded-lg border border-border-default">
            <code>{node.content}</code>
          </pre>
        </div>
      </div>
    );
  }

  // 渲染图片预览
  if (node.fileType === "image") {
    return (
      <div className="flex flex-col h-full bg-surface-2/20 relative animate-fade-in">
        {/* 文件头信息栏 */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle bg-surface-2/40 select-none">
          <span className="text-[10px] font-mono font-semibold text-text-secondary flex items-center gap-1.5 truncate">
            <FileImage className="w-3.5 h-3.5 text-accent-cyan" />
            {node.name}
          </span>
          <span className="text-[9px] font-mono text-text-muted uppercase">
            IMAGE RESOURCE
          </span>
        </div>

        {/* 图片自适应展示区 */}
        <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
          <div className="relative group max-w-full max-h-full">
            <img 
              src={node.src} 
              alt={node.name} 
              className="max-w-full max-h-[450px] object-contain rounded-lg border border-border-default shadow-lg bg-surface-2/50 backdrop-blur-sm"
              loading="lazy"
            />
            {/* 炫光遮罩边框 */}
            <div className="absolute inset-0 rounded-lg border border-brand-indigo/10 pointer-events-none group-hover:border-brand-indigo/35 transition-colors duration-300" />
          </div>
        </div>
      </div>
    );
  }

  // 渲染不支持预览的节点
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-surface-2/10 animate-fade-in">
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-500 mb-4">
        <ShieldAlert className="w-5 h-5" />
      </div>
      <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider font-display">
        不支持预览的格式
      </h3>
      <p className="text-[11px] text-text-secondary mt-1.5 max-w-[220px] leading-relaxed">
        文件 <span className="font-mono text-brand-indigo font-semibold">{node.name}</span> 是二进制或系统不识别的专有格式，暂无法在此以文本方式呈观。
      </p>
    </div>
  );
}
