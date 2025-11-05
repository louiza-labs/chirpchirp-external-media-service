import { fetchListOfImages } from "./fetchListOfImage";

export const fetchAllImages = async () => {
  console.log("Fetching first page to determine total pages...\n");

  const firstPage = await fetchListOfImages(1);
  let allImages = firstPage.images || [];

  if (!firstPage.pagination) {
    console.log(
      `⚠️  No pagination info, returning ${allImages.length} images from first page`
    );
    return allImages;
  }

  const { totalPages } = firstPage.pagination;
  console.log(`Total pages to fetch: ${totalPages}\n`);

  if (totalPages <= 0) {
    console.log(
      `⚠️  Invalid totalPages: ${totalPages}, returning ${allImages.length} images`
    );
    return allImages;
  }

  // fetch remaining pages
  for (let page = 2; page <= totalPages; page++) {
    const result = await fetchListOfImages(page);
    if (result.images && result.images.length > 0) {
      allImages = [...allImages, ...result.images];
    } else {
      console.warn(`⚠️  Page ${page} returned no images`);
    }
    // Wait 50ms between pages to be safe
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  console.log(
    `\n✓ Fetched all ${allImages.length} images across ${totalPages} pages\n`
  );

  if (allImages.length === 0) {
    console.warn(
      `⚠️  WARNING: Fetched 0 images despite pagination indicating ${totalPages} pages`
    );
  }

  return allImages;
};
