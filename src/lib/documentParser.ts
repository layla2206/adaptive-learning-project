export async function parseDocument(buffer: Buffer, fileType: string): Promise<string> {
  const type = fileType.toLowerCase();

  if (type === "pdf") {
    try {
      // Dynamic import to support both ESM/CJS bundler environments
      const pdfParseModule = await import("pdf-parse");
      const pdfParse = (pdfParseModule as any).default || pdfParseModule;
      const data = await pdfParse(buffer);
      return data.text;
    } catch (err) {
      console.error("PDF Parsing failed:", err);
      throw new Error("Failed to parse PDF document.");
    }
  }

  if (["txt", "md", "csv", "json"].includes(type)) {
    return buffer.toString("utf-8");
  }

  throw new Error(`Unsupported file type for parsing: ${fileType}`);
}
