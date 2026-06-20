/**
 * 将字节数格式化为人类可读的容量大小（如 1.2 MB、456.0 KB）
 * 使用 1024 进制，非字节单位保留 1 位小数。
 * 
 * @param bytes 字节数
 * @returns 格式化后的字符串
 */
export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || isNaN(bytes) || bytes < 0) {
    return "0 B";
  }
  if (bytes === 0) {
    return "0 B";
  }

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const unitIndex = Math.min(i, sizes.length - 1);
  const value = bytes / Math.pow(k, unitIndex);

  // 字节不需要小数位，其他单位保留 1 位小数
  return `${unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${sizes[unitIndex]}`;
}
