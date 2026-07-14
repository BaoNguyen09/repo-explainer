/** Copies rendered SVG markup (as text) to the clipboard. */
export async function copyMermaidSvg(svgContent: string): Promise<void> {
  if (!svgContent) return;
  try {
    await navigator.clipboard.writeText(svgContent);
    alert('Diagram copied to clipboard!');
  } catch (error) {
    console.error('Failed to copy:', error);
    alert('Failed to copy diagram');
  }
}

export function downloadMermaidSvg(svgContent: string, diagramId: string): void {
  if (!svgContent) return;
  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `diagram-${diagramId}.svg`;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadMermaidPng(svgContent: string, diagramId: string): void {
  if (!svgContent) return;

  try {
    // Parse the SVG string to extract dimensions
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
    const svgElement = svgDoc.querySelector('svg');

    if (!svgElement) {
      alert('Could not parse SVG content');
      return;
    }

    // Extract dimensions from viewBox or width/height attributes
    let width = 1200;
    let height = 800;

    const viewBox = svgElement.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.split(/\s+/);
      if (parts.length >= 4) {
        width = parseFloat(parts[2]) || width;
        height = parseFloat(parts[3]) || height;
      }
    } else {
      const svgWidth = svgElement.getAttribute('width');
      const svgHeight = svgElement.getAttribute('height');
      if (svgWidth) width = parseFloat(svgWidth.replace(/px|em|rem/, '')) || width;
      if (svgHeight) height = parseFloat(svgHeight.replace(/px|em|rem/, '')) || height;
    }

    // Ensure SVG has explicit dimensions
    svgElement.setAttribute('width', width.toString());
    svgElement.setAttribute('height', height.toString());
    svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    // Serialize the SVG
    const svgData = new XMLSerializer().serializeToString(svgElement);

    // Create image and canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      alert('Canvas context not available');
      return;
    }

    const img = new Image();

    // Use data URL instead of blob URL to avoid CORS issues
    // Encode SVG as base64 data URL
    const svgBase64 = btoa(unescape(encodeURIComponent(svgData)));
    const dataUrl = `data:image/svg+xml;base64,${svgBase64}`;

    img.onload = () => {
      try {
        // Set canvas dimensions
        canvas.width = width;
        canvas.height = height;

        // Fill white background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw the SVG image
        ctx.drawImage(img, 0, 0, width, height);

        // Convert canvas to blob and trigger download
        canvas.toBlob((blob) => {
          if (blob) {
            const downloadUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = `diagram-${diagramId}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(downloadUrl);
          } else {
            alert('Failed to create PNG blob');
          }
        }, 'image/png', 1.0);
      } catch (error) {
        console.error('Error converting to PNG:', error);
        alert('Failed to convert diagram to PNG: ' + (error instanceof Error ? error.message : 'Unknown error'));
      }
    };

    img.onerror = () => {
      console.error('Failed to load SVG image');
      alert('Failed to load SVG for PNG conversion');
    };

    // Set image source using data URL (no CORS issues)
    img.src = dataUrl;
  } catch (error) {
    console.error('PNG export error:', error);
    alert('Failed to export diagram as PNG: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}
