import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { Contract, JsonRpcProvider } from "ethers";
import { getMongoDb } from "../../../lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HASHKEY_TESTNET_RPC_URL = "https://testnet.hsk.xyz";
const MOVIE_COUNT_ABI = ["function movieCount() view returns (uint256)"];

type UpcomingMovie = {
  id: string;
  title: string;
  description: string;
  genre: string;
  creatorWallet: string;
  thumbnailUrl: string;
  targetAmountHsk: number;
  onChainId: number | null;
  status: "upcoming" | "published";
  linkedMovieId: string | null;
  publishedOnChainId: number | null;
  pledgedTotalHsk: number;
  investorCount: number;
  createdAt: string;
};

function normalizeUpcoming(doc: any, stats?: { pledgedTotalHsk?: number; investorCount?: number }): UpcomingMovie {
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
    status: doc?.status === "published" ? "published" : "upcoming",
    linkedMovieId: doc?.linkedMovieId ? String(doc.linkedMovieId) : null,
    publishedOnChainId:
      doc?.publishedOnChainId && Number(doc.publishedOnChainId) > 0
        ? Number(doc.publishedOnChainId)
        : null,
    pledgedTotalHsk: Number(stats?.pledgedTotalHsk || 0),
    investorCount: Number(stats?.investorCount || 0),
    createdAt: new Date(doc?.createdAt || Date.now()).toISOString(),
  };
}

async function getNextUnusedOnChainId(db: any): Promise<number> {
  const contractAddress = process.env.NEXT_PUBLIC_STREAMFI_CONTRACT_ADDRESS;
  if (!contractAddress) {
    throw new Error("Contract address not configured for on-chain ID assignment");
  }

  const provider = new JsonRpcProvider(HASHKEY_TESTNET_RPC_URL);
  const contract = new Contract(contractAddress, MOVIE_COUNT_ABI, provider);
  const movieCountRaw = await contract.movieCount();
  const movieCount = Number(movieCountRaw);

  const [movieIds, upcomingIds] = await Promise.all([
    db
      .collection("Movie")
      .find({ onChainId: { $type: "number", $gt: 0 } }, { projection: { onChainId: 1 } })
      .toArray(),
    db
      .collection("UpcomingMovie")
      .find({ onChainId: { $type: "number", $gt: 0 } }, { projection: { onChainId: 1 } })
      .toArray(),
  ]);

  const used = new Set<number>();

  for (const doc of movieIds) {
    const id = Number(doc?.onChainId || 0);
    if (Number.isInteger(id) && id > 0) used.add(id);
  }

  for (const doc of upcomingIds) {
    const id = Number(doc?.onChainId || 0);
    if (Number.isInteger(id) && id > 0) used.add(id);
  }

  // IDs up to movieCount are already used on-chain.
  let candidate = Math.max(1, movieCount + 1);
  while (used.has(candidate)) candidate += 1;
  return candidate;
}

export async function GET() {
  try {
    const db = await getMongoDb();
    const docs = await db.collection("UpcomingMovie").find({}).sort({ createdAt: -1 }).toArray();

    const statsRows = await db
      .collection("UpcomingInvestment")
      .aggregate([
        {
          $group: {
            _id: "$upcomingId",
            pledgedTotalHsk: { $sum: "$investedHsk" },
            investorCount: { $sum: 1 },
          },
        },
      ])
      .toArray();

    const statsMap = new Map<string, { pledgedTotalHsk: number; investorCount: number }>();
    for (const row of statsRows) {
      const key = row?._id?.toString?.() || String(row?._id || "");
      statsMap.set(key, {
        pledgedTotalHsk: Number(row?.pledgedTotalHsk || 0),
        investorCount: Number(row?.investorCount || 0),
      });
    }

    return NextResponse.json(
      docs.map((doc) => normalizeUpcoming(doc, statsMap.get(doc?._id?.toString?.() || String(doc?._id || ""))))
    );
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
    } = body;

    if (!title || !description || !genre || !creatorWallet) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const db = await getMongoDb();
    const assignedOnChainId = await getNextUnusedOnChainId(db);
    const payload = {
      title: String(title),
      description: String(description),
      genre: String(genre),
      creatorWallet: String(creatorWallet),
      thumbnailUrl: String(thumbnailUrl || ""),
      targetAmountHsk: Number(targetAmountHsk || 0),
      onChainId: assignedOnChainId,
      status: "upcoming",
      linkedMovieId: null,
      publishedOnChainId: null,
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
