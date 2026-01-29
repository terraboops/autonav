/**
 * Text utility functions for UI components
 */

/**
 * Wrap text to fit within a maximum width, breaking at word boundaries
 *
 * @param text - Text to wrap
 * @param maxWidth - Maximum width per line
 * @returns Array of wrapped lines
 */
export function wrapText(text: string, maxWidth: number): string[] {
  const lines: string[] = [];

  // Split by existing newlines first
  const paragraphs = text.split('\n');

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lines.push('');
      continue;
    }

    if (paragraph.length <= maxWidth) {
      lines.push(paragraph);
      continue;
    }

    // Need to wrap this paragraph
    const words = paragraph.split(' ');
    let currentLine = '';

    for (const word of words) {
      // If word itself is longer than maxWidth, we have to break it
      if (word.length > maxWidth) {
        if (currentLine) {
          lines.push(currentLine.trim());
          currentLine = '';
        }
        // Break the long word into chunks
        for (let i = 0; i < word.length; i += maxWidth) {
          lines.push(word.slice(i, i + maxWidth));
        }
        continue;
      }

      // Try adding word to current line
      const testLine = currentLine ? `${currentLine} ${word}` : word;

      if (testLine.length <= maxWidth) {
        currentLine = testLine;
      } else {
        // Current line is full, start new line
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    }

    // Add remaining text
    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines;
}
