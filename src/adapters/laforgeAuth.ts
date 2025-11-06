import axios from "axios";

export const fetchBearerToken = async () => {
  const urlEndpoint = process.env.BEARER_TOKEN_RETRIEVAL_URL;
  if (!urlEndpoint) {
    return null;
  }
  const result = await axios.get(urlEndpoint);
  if (result.data && result.data.token) {
    return result.data.token;
  }
};
