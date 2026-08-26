import { NextRequest, NextResponse } from "next/server";

const FASTAPI_URL = "http://127.0.0.1:8000";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    const response = await fetch(`${FASTAPI_URL}/diagnostic/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: `FastAPI Error: ${err}` }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Diagnostic Generate proxy error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal Next.js proxy failure" },
      { status: 500 }
    );
  }
}
