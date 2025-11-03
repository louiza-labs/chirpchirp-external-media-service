import axios from "axios";

export const fetchListOfImages = async (page = 1) => {
  const externalAPIURL = process.env.EXTERNAL_MEDIA_LIST_API_URL!;
  const bearerToken = process.env.BEARER_TOKEN!;

  try {
    const response = await axios.post(
      externalAPIURL,
      { PageIndex: page },
      {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          "Content-Type": "application/json-patch+json",
        },
      }
    );

    const data = response.data;
    if (!data?.Results) return { images: [], pagination: null };

    const images = data.Results.Results || [];
    const pagination = {
      totalPages: data.Results.TotalPages,
      currentPage: data.Results.CurrentPageIndex,
      totalCount: data.Results.TotalAvailableCount,
      pageSize: data.Results.CurrentPageSize,
    };

    console.log(
      `✓ Fetched page ${pagination.currentPage}/${pagination.totalPages} (${images.length} images)`
    );

    return { images, pagination };
  } catch (error) {
    console.error(`Error fetching images for page ${page}:`, error);
    throw error;
  }
};
