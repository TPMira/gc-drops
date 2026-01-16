"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

function slugifyCharacterName(name: string) {
  // Remove acentos e normaliza para nomes de arquivo previsíveis.
  // Ex: "Dio" -> "dio", "Rey" -> "rey", "Elesis" -> "elesis"
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

type Props = {
  character?: string;
  size?: number; // px
};

export default function CharacterIcon({ character, size = 32 }: Props) {
  const [failed, setFailed] = useState(false);

  const normalized = useMemo(() => {
    const c = (character ?? "").trim();
    if (!c) return null;
    return { label: c, slug: slugifyCharacterName(c) };
  }, [character]);

  if (!normalized) return <span>—</span>;
  if (failed) return <span>{normalized.label}</span>;

  const src = `/personagens/${normalized.slug}.png`;

  return (
    <div className="inline-flex items-center justify-center" title={normalized.label} aria-label={normalized.label}>
      <div
        className="relative"
        style={{ width: size, height: size }}
      >
        <Image
          src={src}
          alt={normalized.label}
          fill
          sizes={`${size}px`}
          className="object-contain"
          quality={[100,75,50,25][Math.min(Math.floor(size / 16), 3)]}
          unoptimized
          style={{ imageRendering: "pixelated" }}
          onError={() => setFailed(true)}
        />
      </div>
      <span className="sr-only">{normalized.label}</span>
    </div>
  );
}
