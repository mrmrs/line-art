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

export async function copySVGToClipboard(svg: Promise<string>): Promise<void> {
  // Promise-backed data preserves the click's user activation in Safari while
  // the export worker renders. Plain text preserves the SVG source verbatim.
  const content = svg.then(text => new Blob([text], { type: 'text/plain' }));
  // Clipboard permission may fail before the renderer settles.
  void content.catch(() => {});
  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    await navigator.clipboard.write([new ClipboardItem({ 'text/plain': content })]);
  } else {
    await navigator.clipboard.writeText(await svg);
  }
}
