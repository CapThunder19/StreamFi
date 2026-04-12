import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
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
      sourceUpcomingId,
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

    // If this movie is published from an upcoming entry, migrate investor ledger snapshot.
    if (sourceUpcomingId && ObjectId.isValid(String(sourceUpcomingId))) {
      const upcomingObjectId = new ObjectId(String(sourceUpcomingId));
      const upcomingInvestors = await db
        .collection("UpcomingInvestment")
        .find({ upcomingId: upcomingObjectId })
        .toArray();

      const totalInvestedHsk = upcomingInvestors.reduce((sum: number, inv: any) => {
        return sum + Number(inv?.investedHsk || 0);
      }, 0);

      const investorLedger = upcomingInvestors.map((inv: any) => {
        const investedHsk = Number(inv?.investedHsk || 0);
        const share = totalInvestedHsk > 0 ? investedHsk / totalInvestedHsk : 0;
        return {
          investorWallet: String(inv?.investorWallet || ""),
          investedHsk,
          share,
        };
      });

      await db.collection("Movie").updateOne(
        { _id: inserted.insertedId },
        {
          $set: {
            sourceUpcomingId: String(sourceUpcomingId),
            upcomingInvestmentTotalHsk: totalInvestedHsk,
            upcomingInvestors: investorLedger,
          },
        }
      );

      await db.collection("UpcomingMovie").updateOne(
        { _id: upcomingObjectId },
        {
          $set: {
            status: "published",
            linkedMovieId: inserted.insertedId.toString(),
            publishedOnChainId: onChainIdNum,
            publishedAt: new Date(),
          },
        }
      );
    }

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
