import { useState, useEffect, useRef } from 'react';
import { useFileLoader } from '../hooks/useFileLoader';

// =============================================================================
// Drag & Drop overlay for loading 3D model files (OBJ, STL)
// Uses document-level listeners so it captures drags from anywhere
// =============================================================================

export function DropZone() {
  const [isDragOver, setIsDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const dragCounter = useRef(0);
  const loadFiles = useFileLoader();

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current++;
      if (e.dataTransfer?.types.includes('Files')) {
        setIsDragOver(true);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current--;
      if (dragCounter.current <= 0) {
        dragCounter.current = 0;
        setIsDragOver(false);
      }
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setIsDragOver(false);

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      setLoading(true);
      try {
        await loadFiles(files);
      } finally {
        setLoading(false);
      }
    };

    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('drop', handleDrop);

    return () => {
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('drop', handleDrop);
    };
  }, [loadFiles]);

  if (!isDragOver && !loading) return null;

  return (
    <div className="drop-zone-overlay-fullscreen">
      <div className="drop-zone-content">
        {loading ? (
          <div className="drop-zone-text">Loading model...</div>
        ) : (
          <>
            <div className="drop-zone-icon">+</div>
            <div className="drop-zone-text">
              Drop OBJ, STL, or SVG files to add to scene
            </div>
          </>
        )}
      </div>
    </div>
  );
}
