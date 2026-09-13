// =============================================================================
// SVG Export Utilities
// =============================================================================

export function downloadSVG(
  svgString: string,
  filename: string = 'plotter-art.svg',
) {
  downloadText(svgString, filename, 'image/svg+xml');
}
export function downloadText(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function copySVGToClipboard(svgString: string): Promise<void> {
  return navigator.clipboard.writeText(svgString);
}
