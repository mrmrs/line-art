// =============================================================================
// SVG Export Utilities
// =============================================================================

export function downloadSVG(svgString: string, filename: string = 'plotter-art.svg') {
  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function copySVGToClipboard(svgString: string): Promise<void> {
  return navigator.clipboard.writeText(svgString);
}
