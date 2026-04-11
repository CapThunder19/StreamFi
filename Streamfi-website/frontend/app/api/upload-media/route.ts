import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";

export const runtime = "nodejs";

const ALLOWED_EXTENSIONS = new Set([
  "mp4",
  "webm",
  "mov",
  "m4v",
  "avi",
  "mkv",
  "mp3",
  "wav",
  "m4a",
  "ogg",
  "flac",
]);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const blob = file as File;
    const originalName = blob.name || "media";
    const ext = originalName.includes(".") ? originalName.split(".").pop()?.toLowerCase() || "" : "";
    const mimeType = (blob.type || "").toLowerCase();
    const isMediaMime = mimeType.startsWith("video/") || mimeType.startsWith("audio/");

    if (!ALLOWED_EXTENSIONS.has(ext) && !isMediaMime) {
      return NextResponse.json(
        { error: "Unsupported file type. Upload a common video/audio file like MP4, WEBM, MP3, WAV." },
        { status: 400 }
      );
    }

    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const uploadsDir = path.join(process.cwd(), "public", "uploads", "media");
    await fs.mkdir(uploadsDir, { recursive: true });

    const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : "mp4";
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`;
    const filePath = path.join(uploadsDir, filename);

    await fs.writeFile(filePath, buffer);

    const url = `/uploads/media/${filename}`;
    return NextResponse.json({ url });
  } catch (err) {
    console.error("POST /api/upload-media error", err);
    return NextResponse.json({ error: "Failed to upload media" }, { status: 500 });
  }
}
