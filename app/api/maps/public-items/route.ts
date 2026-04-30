import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

const ITEMS_DIR = path.join(process.cwd(), "public", "items");
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

// Allowed extensions mapped to their magic byte signatures
const MAGIC: Record<string, { bytes: number[]; mask?: number[]; offset?: number }[]> = {
  ".png":  [{ bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  ".jpg":  [{ bytes: [0xff, 0xd8, 0xff] }],
  ".jpeg": [{ bytes: [0xff, 0xd8, 0xff] }],
  ".webp": [{ bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, { bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 }],
  ".gif":  [{ bytes: [0x47, 0x49, 0x46, 0x38] }],
};

function hasValidMagic(buf: Buffer, ext: string): boolean {
  const sigs = MAGIC[ext];
  if (!sigs) return false;

  if (ext === ".webp") {
    // RIFF at offset 0, WEBP at offset 8
    const riff = sigs[0].bytes;
    const webp = sigs[1].bytes;
    return (
      riff.every((b, i) => buf[i] === b) &&
      webp.every((b, i) => buf[8 + i] === b)
    );
  }

  return sigs[0].bytes.every((b, i) => buf[i] === b);
}

export async function GET() {
  try {
    if (!fs.existsSync(ITEMS_DIR)) return NextResponse.json({ files: [] });
    const files = fs
      .readdirSync(ITEMS_DIR)
      .filter((f) => Object.keys(MAGIC).some((ext) => f.toLowerCase().endsWith(ext)))
      .sort();
    return NextResponse.json({ files });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }

    const ext = path.extname(file.name).toLowerCase();
    if (!MAGIC[ext]) {
      return NextResponse.json(
        { error: "Apenas imagens PNG, JPG, WEBP ou GIF são permitidas" },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Arquivo muito grande (máx 5 MB)" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Validate actual file content via magic bytes — not just the extension
    if (!hasValidMagic(buffer, ext)) {
      return NextResponse.json(
        { error: "Conteúdo do arquivo não corresponde ao formato declarado" },
        { status: 400 }
      );
    }

    // Sanitize filename: lowercase, no accents, only safe chars
    const baseName = path.basename(file.name, ext)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");

    const sanitized = `${baseName}${ext}`;

    if (!fs.existsSync(ITEMS_DIR)) {
      fs.mkdirSync(ITEMS_DIR, { recursive: true });
    }

    const dest = path.join(ITEMS_DIR, sanitized);

    // Prevent path traversal
    if (!dest.startsWith(ITEMS_DIR + path.sep)) {
      return NextResponse.json({ error: "Nome de arquivo inválido" }, { status: 400 });
    }

    await fs.promises.writeFile(dest, buffer);

    return NextResponse.json({ ok: true, filename: sanitized });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
