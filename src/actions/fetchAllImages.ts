import { fetchListOfImages } from "./fetchListOfImage";

export const fetchAllImages = async () => {
  console.log("Fetching first page to determine total pages...\n");

  const firstPage = await fetchListOfImages(1);
  let allImages = firstPage.images;

  if (!firstPage.pagination) {
    return allImages;
  }

  const { totalPages } = firstPage.pagination;
  console.log(`Total pages to fetch: ${totalPages}\n`);

  // fetch remaining pages
  for (let page = 2; page <= totalPages; page++) {
    const result = await fetchListOfImages(page);
    allImages = [...allImages, ...result.images];
  }

  console.log(
    `\n✓ Fetched all ${allImages.length} images across ${totalPages} pages\n`
  );
  return allImages;
};
