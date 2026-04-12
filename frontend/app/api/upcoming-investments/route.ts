import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getMongoDb } from "../../../lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeAmount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function GET(req: NextRequest) {
  try {
    const upcomingId = req.nextUrl.searchParams.get("upcomingId");
    if (!upcomingId || !ObjectId.isValid(upcomingId)) {
      return NextResponse.json({ error: "Valid upcomingId is required" }, { status: 400 });
    }

    const db = await getMongoDb();
    const docs = await db
      .collection("UpcomingInvestment")
      .find({ upcomingId: new ObjectId(upcomingId) })
      .sort({ investedHsk: -1 })
      .toArray();

    const investments = docs.map((d: any) => ({
      id: d?._id?.toString?.() || String(d?._id || ""),
      upcomingId,
      investorWallet: String(d?.investorWallet || ""),
      investedHsk: Number(d?.investedHsk || 0),
      createdAt: new Date(d?.createdAt || Date.now()).toISOString(),
      updatedAt: new Date(d?.updatedAt || Date.now()).toISOString(),
    }));

    const totalInvestedHsk = investments.reduce((sum, inv) => sum + inv.investedHsk, 0);

    return NextResponse.json({
      upcomingId,
      totalInvestedHsk,
      investorCount: investments.length,
      investments,
    });
  } catch (err) {
    console.error("GET /api/upcoming-investments error", err);
    return NextResponse.json({ error: "Failed to fetch upcoming investments" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const upcomingId = String(body?.upcomingId || "").trim();
    const investorWallet = String(body?.investorWallet || "").trim();
    const amountHsk = normalizeAmount(body?.amountHsk);

    if (!upcomingId || !ObjectId.isValid(upcomingId)) {
      return NextResponse.json({ error: "Valid upcomingId is required" }, { status: 400 });
    }
    if (!investorWallet) {
      return NextResponse.json({ error: "Investor wallet is required" }, { status: 400 });
    }
    if (amountHsk <= 0) {
      return NextResponse.json({ error: "Investment amount must be greater than 0" }, { status: 400 });
    }

    const db = await getMongoDb();
    const upcomingObjectId = new ObjectId(upcomingId);

    const upcoming = await db.collection("UpcomingMovie").findOne({ _id: upcomingObjectId });
    if (!upcoming) {
      return NextResponse.json({ error: "Upcoming movie not found" }, { status: 404 });
    }
    if (upcoming?.status === "published") {
      return NextResponse.json({ error: "This upcoming movie is already published" }, { status: 400 });
    }

    const walletLower = investorWallet.toLowerCase();
    const now = new Date();

    await db.collection("UpcomingInvestment").updateOne(
      { upcomingId: upcomingObjectId, investorWalletLower: walletLower },
      {
        $set: {
          investorWallet,
          investorWalletLower: walletLower,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
        $inc: {
          investedHsk: amountHsk,
        },
      },
      { upsert: true }
    );

    const summary = await db
      .collection("UpcomingInvestment")
      .aggregate([
        { $match: { upcomingId: upcomingObjectId } },
        {
          $group: {
            _id: "$upcomingId",
            totalInvestedHsk: { $sum: "$investedHsk" },
            investorCount: { $sum: 1 },
          },
        },
      ])
      .toArray();

    const totals = summary[0] || { totalInvestedHsk: 0, investorCount: 0 };

    return NextResponse.json({
      success: true,
      upcomingId,
      totalInvestedHsk: Number(totals.totalInvestedHsk || 0),
      investorCount: Number(totals.investorCount || 0),
      message: "Investment recorded for upcoming movie",
    });
  } catch (err) {
    console.error("POST /api/upcoming-investments error", err);
    return NextResponse.json({ error: "Failed to record upcoming investment" }, { status: 500 });
  }
}
