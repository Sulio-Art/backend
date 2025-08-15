
export function mapPlanName(plan) {
  if (!plan) return "free";
  const planMap = {
    basic: "free",
    pro: "pro",
    premium: "premium",
  };
  return planMap[plan] || free;
}
//TODO need to change the plans