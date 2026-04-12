import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getMongoDb } from "../../../lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UpcomingMovie = {
  id: string;
  title: string;
  description: string;
  genre: string;
  creatorWallet: string;
  thumbnailUrl: string;
  targetAmountHsk: number;
  onChainId: number | null;
  createdAt: string;
};

function normalizeUpcoming(doc: any): UpcomingMovie {
  return {
    id: doc?._id?.toString?.() || String(doc?._id || ""),
    title: String(doc?.title || "Untitled"),
    description: String(doc?.description || ""),
    genre: String(doc?.genre || "Unknown"),
    creatorWallet: String(doc?.creatorWallet || ""),
    thumbnailUrl: String(doc?.thumbnailUrl || ""),
    targetAmountHsk: Number(doc?.targetAmountHsk || 0),
    onChainId:
      doc?.onChainId && Number(doc.onChainId) > 0
        ? Number(doc.onChainId)
        : null,
    createdAt: new Date(doc?.createdAt || Date.now()).toISOString(),
  };
}

export async function GET() {
  try {
    const db = await getMongoDb();
    const docs = await db.collection("UpcomingMovie").find({}).sort({ createdAt: -1 }).toArray();
    return NextResponse.json(docs.map(normalizeUpcoming));
  } catch (err) {
    console.error("GET /api/upcoming-movies error", err);
    return NextResponse.json({ error: "Failed to fetch upcoming movies" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      title,
      description,
      genre,
      creatorWallet,
      thumbnailUrl,
      targetAmountHsk,
      onChainId,
    } = body;

    if (!title || !description || !genre || !creatorWallet) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const db = await getMongoDb();
    const payload = {
      title: String(title),
      description: String(description),
      genre: String(genre),
      creatorWallet: String(creatorWallet),
      thumbnailUrl: String(thumbnailUrl || ""),
      targetAmountHsk: Number(targetAmountHsk || 0),
      onChainId: onChainId && Number(onChainId) > 0 ? Number(onChainId) : null,
      createdAt: new Date(),
    };

    const inserted = await db.collection("UpcomingMovie").insertOne(payload);
    const upcoming = normalizeUpcoming({ _id: inserted.insertedId, ...payload });

    return NextResponse.json(upcoming, { status: 201 });
  } catch (err) {
    console.error("POST /api/upcoming-movies error", err);
    return NextResponse.json({ error: "Failed to create upcoming movie" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid upcoming movie id" }, { status: 400 });
    }

    const db = await getMongoDb();
    const result = await db.collection("UpcomingMovie").deleteOne({ _id: new ObjectId(id) });
    if (!result.deletedCount) {
      return NextResponse.json({ error: "Upcoming movie not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error("DELETE /api/upcoming-movies error", err);
    return NextResponse.json({ error: "Failed to delete upcoming movie" }, { status: 500 });
  }
}
