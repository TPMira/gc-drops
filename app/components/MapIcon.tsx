"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

function slugifyMapName(name: string) {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

type Props = {
  map?: string;
  width?: number;
  height?: number;
  showLabel?: boolean;
};

export default function MapIcon({ map, width = 88, height = 32, showLabel = true }: Props) {
  const [failed, setFailed] = useState(false);

  const normalized = useMemo(() => {
    const m = (map ?? "").trim();
    if (!m) return null;
    return { label: m, slug: slugifyMapName(m) };
  }, [map]);

  if (!normalized) return <span>—</span>;

  if (failed) {
    return showLabel ? <span>{normalized.label}</span> : null;
  }

  const src = `/maps/${normalized.slug}.png`;

  return (
    <div className="inline-flex items-center gap-2" title={normalized.label} aria-label={normalized.label}>
      <div
        className="relative rounded border border-white/15 bg-black/30 overflow-hidden"
        style={{ width, height }}
      >
        <Image
          src={src}
          alt={normalized.label}
          fill
          sizes={`${width}px`}
          className="object-cover"
          quality={100}
          unoptimized
          onError={() => setFailed(true)}
        />
      </div>
      {/* {showLabel ? <span className="text-gray-200">{normalized.label}</span> : null} */}
      {/* <span className="sr-only">{normalized.label}</span> */}
    </div>
  );
}
