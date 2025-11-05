export const callNextService = async () => {
  const nextServiceUrl = process.env.NEXT_SERVICE_URL;

  if (!nextServiceUrl) {
    console.log(
      "⚠ NEXT_SERVICE_URL not configured, skipping next service call"
    );
    return;
  }

  console.log("Calling the next service:", nextServiceUrl);

  try {
    const response = await fetch(nextServiceUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        triggered_by: "external-media-service",
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Next service returned ${response.status}: ${response.statusText}`
      );
    }

    console.log("✓ Next service triggered successfully");
    return await response.json();
  } catch (error) {
    console.error("⚠ Failed to trigger next service (non-blocking):", error);
    // Don't throw - we don't want to fail the main process if next service fails
  }
};
