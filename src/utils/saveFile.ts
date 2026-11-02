export function saveFile(name: string, content: BlobPart, type: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = name;
  link.click();
  // Released after the browser has taken the file, or the download may be cancelled.
  setTimeout(() => URL.revokeObjectURL(link.href));
}
