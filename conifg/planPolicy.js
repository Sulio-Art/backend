export const PLAN_POLICY = {
  free: {
    artworkMaxSizeMB: 20,
    storageLimitBytes: 20 * 1024 * 1024,
    maxArtworks: 50,
    features: {
      transactionManagement: false,
      aiChatbot: true,
      eventManagement: true,
      dailyDiary: true,
    },
  },
  plus: {
    artworkMaxSizeMB: 100,
    storageLimitBytes: 50 * 1024 * 1024,
    maxArtworks: 200,
    features: {
      transactionManagement: true,
      aiChatbot: true,
      eventManagement: true,
      dailyDiary: true,
    },
  },
  premium: {
    artworkMaxSizeMB: 200,
    storageLimitBytes: 200 * 1024 * 1024,
    maxArtworks: 1000,
    features: {
      transactionManagement: true,
      aiChatbot: true,
      eventManagement: true,
      dailyDiary: true,
    },
  },
  pro: {
    artworkMaxSizeMB: 500,
    storageLimitBytes: 500 * 1024 * 1024,
    maxArtworks: 5000,
    features: {
      transactionManagement: true,
      aiChatbot: true,
      eventManagement: true,
      dailyDiary: true,
    },
  },
};

export function getEntitlements(plan = "free", status = "active") {
  const effectivePlan = plan || "free";

  const isActive = status === "active" || status === "trial";

  if (!isActive) {
    const policy = PLAN_POLICY[effectivePlan] || PLAN_POLICY.free;
    return {
      effectivePlan,
      isActive: false,
      artworkMaxSizeMB: policy.artworkMaxSizeMB,
      storageLimitBytes: policy.storageLimitBytes,
      maxArtworks: policy.maxArtworks,

      features: {
        transactionManagement: false,
        aiChatbot: false,
        eventManagement: false,
        dailyDiary: false,
      },
    };
  }

  const policy = PLAN_POLICY[effectivePlan] || PLAN_POLICY.free;
  return {
    effectivePlan,
    isActive: true,
    artworkMaxSizeMB: policy.artworkMaxSizeMB,
    storageLimitBytes: policy.storageLimitBytes,
    maxArtworks: policy.maxArtworks,
    features: policy.features,
  };
}
