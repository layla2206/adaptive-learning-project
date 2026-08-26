import { NextRequest, NextResponse } from "next/server";

const FASTAPI_URL = "http://127.0.0.1:8000";

export async function GET(req: NextRequest, { params }: { params: Promise<{ studentId: string }> }) {
  try {
    const { studentId } = await params;
    
    const response = await fetch(`${FASTAPI_URL}/profile/${studentId}`);
    
    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: `FastAPI Error: ${err}` }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Profile GET proxy error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal Next.js proxy failure" },
      { status: 500 }
    );
  }
}
