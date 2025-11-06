import axios from "axios";
import { fetchBearerToken } from "../adapters/laforgeAuth.ts";
export const fetchListOfImages = async (
  page = 1,
  retry = true
): Promise<{ images: any[]; pagination: any }> => {
  const externalAPIURL = process.env.EXTERNAL_MEDIA_LIST_API_URL!;
  const bearerToken = await fetchBearerToken();
  if (!bearerToken) {
    // error getting the bearer token
    console.error("Unable to retrieve the bearer token");
    return {
      images: [],
      pagination: {
        totalPages: 1,
        currentPage: 1,
        totalCount: 0,
        pageSize: 0,
      },
    };
  }

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

    if (!data?.Results) {
      console.warn(
        `⚠️  Page ${page}: No Results in response`,
        JSON.stringify(data, null, 2)
      );
      // Release response data
      (response.data as any) = null;
      return { images: [], pagination: null };
    }

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

    // Log if we got pagination but no images
    if (pagination.totalPages > 0 && images.length === 0) {
      console.warn(
        `⚠️  Page ${page}: Pagination indicates ${pagination.totalPages} pages but no images returned`
      );
    }

    // Release response data after extracting what we need
    (response.data as any) = null;

    return { images, pagination };
  } catch (error: any) {
    // Handle 401 - clear cache and retry once
    if (error.response?.status === 401 && retry) {
      return fetchListOfImages(page, false);
    }

    console.error(`Error fetching images for page ${page}:`, error);
    throw error;
  }
};
