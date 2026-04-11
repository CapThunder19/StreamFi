import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export async function GET() {
  try {
    // Use raw query to handle documents that may have null onChainId
    // (legacy movies uploaded before on-chain registration was required)
    const movies = await prisma.movie.findRaw({
      options: { sort: { createdAt: -1 } },
    });

    const moviesArray = Array.isArray(movies) ? (movies as unknown[]) : [];

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
    return NextResponse.json({ error: "Failed to fetch movies" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
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

    const movie = await prisma.movie.create({
      data: {
        onChainId: Number(onChainId),
        title,
        description,
        genre,
        duration: Number(duration),
        pricePerSecond: Number(pricePerSecond),
        creatorWallet,
        videoUrl,
        thumbnailUrl,
      },
    });

    return NextResponse.json(movie, { status: 201 });
  } catch (err) {
    console.error("POST /api/movies error", err);
    return NextResponse.json({ error: "Failed to create movie" }, { status: 500 });
  }
}
