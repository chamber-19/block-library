/**
 * Thumbnail Service
 * Handles thumbnail generation and caching for DWG blocks
 */

export class ThumbnailService {
  private static readonly API_BASE = 'http://localhost:8000/api';
  private static readonly CACHE_PREFIX = 'thumbnail_';
  
  /**
   * Generate thumbnail for a DWG file
   */
  static async generateThumbnail(
    file: File, 
    size: number = 256
  ): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('size', size.toString());

    try {
      const response = await fetch(`${this.API_BASE}/thumbnails/generate`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Thumbnail generation failed: ${response.statusText}`);
      }

      // If the API returns a file directly
      if (response.headers.get('content-type')?.includes('image/png')) {
        const blob = await response.blob();
        return URL.createObjectURL(blob);
      }

      // If the API returns JSON with thumbnail info
      const result = await response.json();
      return result.thumbnail_url || result.thumbnail;
    } catch (error) {
      console.error('Thumbnail generation failed:', error);
      throw error;
    }
  }

  /**
   * Get thumbnail by file hash (for cached thumbnails)
   */
  static async getThumbnailByHash(
    fileHash: string, 
    size: number = 256
  ): Promise<string> {
    try {
      const response = await fetch(
        `${this.API_BASE}/thumbnails/file/${fileHash}?size=${size}`
      );

      if (!response.ok) {
        throw new Error(`Thumbnail not found: ${response.statusText}`);
      }

      const blob = await response.blob();
      return URL.createObjectURL(blob);
    } catch (error) {
      console.error('Failed to get cached thumbnail:', error);
      throw error;
    }
  }

  /**
   * Generate thumbnail from DWG path (for existing blocks)
   */
  static async generateThumbnailFromPath(
    dwgPath: string,
    blockName: string,
    size: number = 256
  ): Promise<string> {
    // Try to generate real thumbnail from backend first
    try {
      console.log(`🖼️ Generating real thumbnail for ${blockName} at ${dwgPath}`);

      // Check if file exists and is accessible
      if (dwgPath && dwgPath.endsWith('.dwg')) {
        // Create a File object from the path (for local files)
        // Note: This requires the file to be accessible via fetch or file input
        const response = await fetch(`${this.API_BASE}/thumbnails/generate-from-path`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            dwg_path: dwgPath,
            block_name: blockName,
            size: size
          }),
        });

        if (response.ok) {
          const blob = await response.blob();
          const thumbnailUrl = URL.createObjectURL(blob);
          console.log(`✅ Real thumbnail generated for ${blockName}`);
          return thumbnailUrl;
        } else {
          console.warn(`⚠️ Backend thumbnail failed for ${blockName}, using placeholder`);
        }
      }
    } catch (error) {
      console.warn(`⚠️ Real thumbnail generation failed for ${blockName}:`, error);
    }

    // Fallback to geometric placeholder
    console.log(`🎨 Creating placeholder thumbnail for ${blockName}`);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      // Create a simple geometric placeholder
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, size, size);
      
      // Add some geometric shapes based on block name
      ctx.fillStyle = '#3b82f6';
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 2;
      
      const centerX = size / 2;
      const centerY = size / 2;
      const shapeSize = size * 0.6;
      
      if (blockName.toLowerCase().includes('ground')) {
        // Draw grounding symbol
        ctx.beginPath();
        ctx.moveTo(centerX - shapeSize/4, centerY - shapeSize/4);
        ctx.lineTo(centerX + shapeSize/4, centerY - shapeSize/4);
        ctx.moveTo(centerX, centerY - shapeSize/4);
        ctx.lineTo(centerX, centerY + shapeSize/4);
        // Ground lines
        for (let i = 0; i < 3; i++) {
          const y = centerY + shapeSize/4 + i * 8;
          const width = shapeSize/3 - i * 6;
          ctx.moveTo(centerX - width/2, y);
          ctx.lineTo(centerX + width/2, y);
        }
        ctx.stroke();
      } else if (blockName.toLowerCase().includes('relay')) {
        // Draw relay symbol
        ctx.fillRect(centerX - shapeSize/4, centerY - shapeSize/4, shapeSize/2, shapeSize/2);
        ctx.strokeRect(centerX - shapeSize/4, centerY - shapeSize/4, shapeSize/2, shapeSize/2);
      } else {
        // Default geometric shape
        ctx.beginPath();
        ctx.arc(centerX, centerY, shapeSize/4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      
      // Add text
      ctx.fillStyle = '#e2e8f0';
      ctx.font = `${Math.floor(size/16)}px Arial`;
      ctx.textAlign = 'center';
      ctx.fillText(blockName.substring(0, 8), centerX, centerY + shapeSize/2 + 20);
    }
    
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(URL.createObjectURL(blob));
        } else {
          resolve('');
        }
      }, 'image/png');
    });
  }

  /**
   * Cache thumbnail URL in localStorage
   */
  static cacheThumbnailUrl(blockId: string, url: string): void {
    try {
      localStorage.setItem(`${this.CACHE_PREFIX}${blockId}`, url);
    } catch (error) {
      console.warn('Failed to cache thumbnail URL:', error);
    }
  }

  /**
   * Get cached thumbnail URL from localStorage
   */
  static getCachedThumbnailUrl(blockId: string): string | null {
    try {
      return localStorage.getItem(`${this.CACHE_PREFIX}${blockId}`);
    } catch (error) {
      console.warn('Failed to get cached thumbnail URL:', error);
      return null;
    }
  }

  /**
   * Clear thumbnail cache
   */
  static clearCache(): void {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(this.CACHE_PREFIX)) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.warn('Failed to clear thumbnail cache:', error);
    }
  }
}
