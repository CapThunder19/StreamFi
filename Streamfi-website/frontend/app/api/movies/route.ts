import { NextRequest, NextResponse } from "next/server";
import { getMongoDb } from "../../../lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json([], { status: 200 });
    }

    const db = await getMongoDb();
    const movies = await db.collection("Movie").find({}).sort({ createdAt: -1 }).toArray();
    const moviesArray = Array.isArray(movies) ? movies : [];

    // Normalize the raw MongoDB documents into a clean shape
    const normalized = moviesArray.map((m: any) => ({
      id: m._id?.$oid || m._id?.toString?.() || String(m._id),
      onChainId: m.onChainId ?? 0,
      title: m.title ?? "Untitled",
      description: m.description ?? "",
      genre: m.genre ?? "Unknown",
      duration: m.duration ?? 0,
      pricePerSecond: m.pricePerSecond ?? 0,
      creatorWallet: m.creatorWallet ?? "",
      videoUrl: m.videoUrl ?? "",
      thumbnailUrl: m.thumbnailUrl ?? "",
      createdAt: m.createdAt?.$date || m.createdAt || null,
    }));

    return NextResponse.json(normalized);
  } catch (err) {
    console.error("GET /api/movies error", err);
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ error: "DATABASE_URL is not configured" }, { status: 500 });
    }

    const body = await req.json();
    const {
      onChainId,
      title,
      description,
      genre,
      duration,
      pricePerSecond,
      creatorWallet,
      videoUrl,
      thumbnailUrl,
    } = body;

    if (!onChainId || !title || !description || !genre || !duration || !pricePerSecond || !creatorWallet || !videoUrl || !thumbnailUrl) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const onChainIdNum = Number(onChainId);
    const durationNum = Number(duration);
    const ppsNum = Number(pricePerSecond);

    if (!Number.isFinite(onChainIdNum) || onChainIdNum <= 0) {
      return NextResponse.json({ error: "Invalid onChainId" }, { status: 400 });
    }
    if (!Number.isFinite(durationNum) || durationNum <= 0) {
      return NextResponse.json({ error: "Invalid duration" }, { status: 400 });
    }
    if (!Number.isFinite(ppsNum) || ppsNum <= 0) {
      return NextResponse.json({ error: "Invalid pricePerSecond" }, { status: 400 });
    }

    const db = await getMongoDb();
    const createdAt = new Date();
    const doc = {
      onChainId: onChainIdNum,
      title: String(title),
      description: String(description),
      genre: String(genre),
      duration: durationNum,
      pricePerSecond: ppsNum,
      creatorWallet: String(creatorWallet),
      videoUrl: String(videoUrl),
      thumbnailUrl: String(thumbnailUrl),
      createdAt,
    };

    const inserted = await db.collection("Movie").insertOne(doc);

    const movie = {
      id: inserted.insertedId.toString(),
      ...doc,
    };

    return NextResponse.json(movie, { status: 201 });
  } catch (err) {
    console.error("POST /api/movies error", err);
    return NextResponse.json({ error: "Failed to create movie", details: (err as Error)?.message || "Unknown error" }, { status: 500 });
  }
}
