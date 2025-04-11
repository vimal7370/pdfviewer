/**
 * Watermark functionality for PDF viewer
 */

"use strict";

// import { watermarkConfig } from "./config.js";
import { globalConfig } from "./globalConfig.js";

const watermarkConfig = globalConfig.waterMark;

/**
 * Measures the width of text using the canvas context
 * @param {CanvasRenderingContext2D} ctx - The canvas rendering context
 * @param {string} text - The text to measure
 * @returns {number} - The width of the text in pixels
 */
function measureTextWidth(ctx, text) {
  return ctx.measureText(text).width;
}

/**
 * Splits text into lines that fit within a maximum width
 * @param {CanvasRenderingContext2D} ctx - The canvas rendering context
 * @param {string} text - The text to split
 * @param {number} maxWidth - The maximum width for each line
 * @returns {string[]} - Array of text lines
 */
function autoWrapText(ctx, text, maxWidth) {
  // If text already contains line breaks, split by them first
  const paragraphs = text.split('\n');
  const lines = [];
  
  for (const paragraph of paragraphs) {
    // If paragraph is empty, add an empty line
    if (paragraph.length === 0) {
      lines.push('');
      continue;
    }
    
    // Split paragraph into words
    const words = paragraph.split(' ');
    let currentLine = words[0];
    
    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const width = measureTextWidth(ctx, currentLine + ' ' + word);
      
      if (width <= maxWidth) {
        currentLine += ' ' + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    
    lines.push(currentLine);
  }
  
  return lines;
}

/**
 * Draws a watermark directly on the canvas
 * @param {CanvasRenderingContext2D} ctx - The canvas rendering context
 * @param {number} width - The width of the canvas
 * @param {number} height - The height of the canvas
 * @param {number} scale - The scale factor (zoom/72)
 */
export function drawWatermark(ctx, width, height, scale) {
  // Check if watermarking is enabled
  if (!watermarkConfig.enabled || !watermarkConfig.text) {
    return;
  }

  try {
    // Save the current canvas state
    ctx.save();
    
    // Set watermark text properties
    ctx.globalAlpha = watermarkConfig.opacity;
    ctx.fillStyle = watermarkConfig.color;
    ctx.font = `${watermarkConfig.fontSize * scale}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Calculate spacing and maximum width for text based on repeat spacing
    const spacing = watermarkConfig.repeatSpacing * scale;
    const maxTextWidth = spacing * 0.8; // Use 80% of spacing as max width to ensure text fits
    
    // Auto-wrap text based on the maximum width
    const textLines = autoWrapText(ctx, watermarkConfig.text, maxTextWidth);
    const lineHeight = watermarkConfig.fontSize * scale * 1.2; // 1.2 is line spacing factor
    
    // If repeating watermark is enabled
    if (watermarkConfig.repeat) {
      
      // Calculate how many watermarks to draw horizontally and vertically
      const cols = Math.ceil(width / spacing);
      const rows = Math.ceil(height / spacing);
      
      // Draw watermarks in a grid pattern
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          const x = j * spacing + spacing / 2;
          const y = i * spacing + spacing / 2;
          
          // Draw rotated text
          ctx.translate(x, y);
          ctx.rotate((watermarkConfig.rotation * Math.PI) / 180);
          
          // Draw each line of text
          textLines.forEach((line, index) => {
            const yOffset = (index - (textLines.length - 1) / 2) * lineHeight;
            ctx.fillText(line, 0, yOffset);
          });
          
          ctx.rotate(-(watermarkConfig.rotation * Math.PI) / 180);
          ctx.translate(-x, -y);
        }
      }
    } else {
      // Draw a single watermark in the center
      ctx.translate(width / 2, height / 2);
      ctx.rotate((watermarkConfig.rotation * Math.PI) / 180);
      
      // Draw each line of text
      textLines.forEach((line, index) => {
        const yOffset = (index - (textLines.length - 1) / 2) * lineHeight;
        ctx.fillText(line, 0, yOffset);
      });
    }
    
    // Restore the canvas state
    ctx.restore();
  } catch (error) {
    console.error("Error drawing watermark:", error);
  }
}



