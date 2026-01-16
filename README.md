This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Persistência (Vercel)

Em ambiente local este projeto lê/escreve em arquivos dentro de `data/*.json`.

Quando você faz deploy na Vercel, o filesystem do runtime é **read-only** (por isso o erro `EROFS: read-only file system`). Para permitir salvar runs/ranks em produção, o projeto usa **Vercel KV**.

### Como configurar

1. No painel da Vercel: **Storage → KV → Create** (ou Connect).
2. A Vercel vai criar automaticamente as env vars do KV (ex.: `KV_REST_API_URL` e `KV_REST_API_TOKEN`).
3. Faça um novo deploy.

### Como funciona

- Em produção, `readJson/writeJson` gravam no KV com chave `jsondb:<arquivo>`.
- Na primeira leitura, se não existir nada no KV ainda, ele faz *seed* a partir do JSON local do repositório (ex.: `data/maps.json`).

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
