import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

type UpcomingMovie = {
  id: string;
  title: string;
  description: string;
  genre: string;
  creatorWallet: string;
  targetAmountHsk: number;
  onChainId: number | null;
  createdAt: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "upcoming-movies.json");

async function readUpcomingMovies(): Promise<UpcomingMovie[]> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const content = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeUpcomingMovies(movies: UpcomingMovie[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(movies, null, 2), "utf8");
}

export async function GET() {
  try {
    const movies = await readUpcomingMovies();
    return NextResponse.json(movies.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)));
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
      targetAmountHsk,
      onChainId,
    } = body;

    if (!title || !description || !genre || !creatorWallet) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const upcoming: UpcomingMovie = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: String(title),
      description: String(description),
      genre: String(genre),
      creatorWallet: String(creatorWallet),
      targetAmountHsk: Number(targetAmountHsk || 0),
      onChainId: onChainId && Number(onChainId) > 0 ? Number(onChainId) : null,
      createdAt: new Date().toISOString(),
    };

    const all = await readUpcomingMovies();
    all.unshift(upcoming);
    await writeUpcomingMovies(all);

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

    const all = await readUpcomingMovies();
    const before = all.length;
    const filtered = all.filter((m) => m.id !== id);

    if (filtered.length === before) {
      return NextResponse.json({ error: "Upcoming movie not found" }, { status: 404 });
    }

    await writeUpcomingMovies(filtered);
    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error("DELETE /api/upcoming-movies error", err);
    return NextResponse.json({ error: "Failed to delete upcoming movie" }, { status: 500 });
  }
}
