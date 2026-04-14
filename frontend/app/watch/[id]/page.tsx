import { notFound } from "next/navigation";
import { ObjectId } from "mongodb";
import { getMongoDb } from "../../../lib/mongodb";
import MoviePlayer from "../../../components/MoviePlayer";

interface WatchPageProps {
  params: { id: string };
}

export default async function WatchPage({ params }: WatchPageProps) {
  const { id } = params;

  if (!id || !ObjectId.isValid(id)) {
    return notFound();
  }

  let movie: any = null;
  try {
    const db = await getMongoDb();
    movie = await db.collection("Movie").findOne({ _id: new ObjectId(id) });
  } catch (error) {
    console.error("Watch page movie fetch failed", error);
    return notFound();
  }

  if (!movie) {
    return notFound();
  }

  return (
    <MoviePlayer
      movieId={movie._id.toString()}
      onChainId={Number(movie.onChainId || 0)}
      videoUrl={String(movie.videoUrl || "")}
      title={String(movie.title || "Untitled")}
      pricePerSecond={Number(movie.pricePerSecond || 0)}
      creatorWallet={String(movie.creatorWallet || "")}
    />
  );
}
