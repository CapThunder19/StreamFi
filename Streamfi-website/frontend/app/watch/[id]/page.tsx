import { notFound } from "next/navigation";
import { prisma } from "../../../lib/prisma";
import MoviePlayer from "../../../components/MoviePlayer";

interface WatchPageProps {
  params: { id: string };
}

export default async function WatchPage({ params }: WatchPageProps) {
  const { id } = params;

  if (!id) {
    return notFound();
  }

  const movie = await prisma.movie.findUnique({ where: { id } });

  if (!movie) {
    return notFound();
  }

  return (
    <MoviePlayer
      movieId={movie.id}
      onChainId={movie.onChainId}
      videoUrl={movie.videoUrl}
      title={movie.title}
      pricePerSecond={movie.pricePerSecond}
    />
  );
}
