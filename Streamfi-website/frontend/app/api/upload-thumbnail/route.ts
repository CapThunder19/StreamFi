import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const blob = file as File;
    const mimeType = (blob.type || "").toLowerCase();
    if (!mimeType.startsWith("image/")) {
      return NextResponse.json({ error: "Only image files are allowed for thumbnail" }, { status: 400 });
    }

    if (blob.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Thumbnail too large. Max size is 10MB" }, { status: 400 });
    }

    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const uploadsDir = path.join(process.cwd(), "public", "uploads", "thumbnails");
    await fs.mkdir(uploadsDir, { recursive: true });

    const originalName = blob.name || "thumbnail";
    const ext = originalName.includes(".") ? originalName.split(".").pop() : "png";
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const filePath = path.join(uploadsDir, filename);

    await fs.writeFile(filePath, buffer);

    const url = `/uploads/thumbnails/${filename}`;

    return NextResponse.json({ url });
  } catch (err) {
    console.error("POST /api/upload-thumbnail error", err);
    return NextResponse.json({ error: "Failed to upload thumbnail" }, { status: 500 });
  }
}
