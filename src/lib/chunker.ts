export type Chunk = {
  text: string;
  pageNumber?: number;
};

export function chunkText(text: string, maxChunkSize = 1000, overlap = 200): Chunk[] {
  const chunks: Chunk[] = [];
  let startIndex = 0;
  
  while (startIndex < text.length) {
    let endIndex = startIndex + maxChunkSize;
    
    if (endIndex < text.length) {
      // try to find a newline or space to break at cleanly
      const nextNewline = text.lastIndexOf('\n', endIndex);
      const nextSpace = text.lastIndexOf(' ', endIndex);
      
      // If we find a break point past the halfway mark of the chunk, use it
      if (nextNewline > startIndex + (maxChunkSize / 2)) {
        endIndex = nextNewline;
      } else if (nextSpace > startIndex + (maxChunkSize / 2)) {
        endIndex = nextSpace;
      }
    } else {
      endIndex = text.length;
    }
    
    const chunkText = text.slice(startIndex, endIndex).trim();
    if (chunkText) {
      chunks.push({ text: chunkText });
    }
    
    let nextStart = endIndex - overlap;
    
    // Ensure we are always advancing to prevent infinite loops
    if (nextStart <= startIndex) {
      nextStart = endIndex;
    }
    
    startIndex = nextStart;
  }
  
  return chunks;
}
