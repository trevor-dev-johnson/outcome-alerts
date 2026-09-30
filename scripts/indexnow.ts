import { getIndexablePublicUrls, submitIndexNow } from "../lib/indexnow";

async function main() {
  const requestedUrls = process.argv.slice(2);
  const urls = requestedUrls.length > 0 ? requestedUrls : getIndexablePublicUrls();
  const result = await submitIndexNow(urls);

  if (result.outcome === "accepted") {
    console.log(`IndexNow accepted ${result.urls.length} URL(s) with status ${result.status}.`);
    for (const url of result.urls) console.log(`- ${url}`);
  } else if (result.outcome === "skipped") {
    console.error("IndexNow submission skipped: INDEXNOW_KEY is not configured.");
    process.exitCode = 1;
  } else if (result.outcome === "rejected") {
    console.error(`IndexNow submission rejected locally: ${result.reason}.`);
    for (const item of result.rejected ?? []) {
      console.error(`- ${item.input}: ${item.reason}`);
    }
    process.exitCode = 1;
  } else {
    const status = result.status ? ` (HTTP ${result.status})` : "";
    console.error(`IndexNow submission failed: ${result.reason}${status}.`);
    process.exitCode = 1;
  }
}

main().catch(() => {
  console.error("IndexNow submission failed unexpectedly.");
  process.exitCode = 1;
});
