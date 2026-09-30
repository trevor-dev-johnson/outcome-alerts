import { getIndexNowKey } from "@/lib/indexnow";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key: requestedKey } = await params;
  const configuredKey = getIndexNowKey();
  const isPublicKeyPath = new URL(request.url).pathname === `/${requestedKey}.txt`;

  if (!isPublicKeyPath || !configuredKey || requestedKey !== configuredKey) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(configuredKey, {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
      "x-robots-tag": "noindex",
    },
  });
}
