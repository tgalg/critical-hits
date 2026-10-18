import Image from "next/image";
import { cn } from "@/lib/utils";

// IGDB t_cover_big images are 264x374.
export function GameCover({
  src,
  title,
  className,
  priority,
}: {
  src: string | null;
  title: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative aspect-[264/374] overflow-hidden rounded-md bg-muted",
        className,
      )}
    >
      {src ? (
        <Image
          src={src}
          alt={`Cover of ${title}`}
          fill
          sizes="(min-width: 640px) 200px, 45vw"
          className="object-cover"
          priority={priority}
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs text-muted-foreground">
          {title}
        </span>
      )}
    </div>
  );
}
