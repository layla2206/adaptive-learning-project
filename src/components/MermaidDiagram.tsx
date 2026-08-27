"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./MermaidDiagram.module.css";

let mermaidInitialized = false;
let renderCounter = 0;

export default function MermaidDiagram({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      setSvg(null);
      setFailed(false);
      try {
        const mermaid = (await import("mermaid")).default;
        if (!mermaidInitialized) {
          mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "strict" });
          mermaidInitialized = true;
        }
        renderCounter += 1;
        const { svg: renderedSvg } = await mermaid.render(`mermaid-${renderCounter}`, code);
        if (!cancelled) setSvg(renderedSvg);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (failed) {
    return (
      <div className={styles.fallback}>
        <p className={styles.fallbackHint}>Couldn&apos;t render this diagram — showing the raw source instead.</p>
        <pre className={styles.fallbackCode}>{code}</pre>
      </div>
    );
  }

  if (!svg) {
    return <p className={styles.loading}>Rendering diagram…</p>;
  }

  return <div ref={containerRef} className={styles.wrap} dangerouslySetInnerHTML={{ __html: svg }} />;
}