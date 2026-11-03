export function buildBrief(candidateId: string) {
  return {
    schemaVersion: "1.0",
    contentId: `cnt_${Date.now()}`,
    candidateId: candidateId,
    decision: "CREATE_NEW",
    primaryQuery: "thuế bán hàng online 2026",
    intent: "commercial_investigation",
    audience: "Người kinh doanh online",
    businessGoal: "generate_lead",
    answerTarget: "Theo quy định mới năm 2026, người kinh doanh online có doanh thu trên 100 triệu VNĐ/năm phải đóng 1.5% thuế GTGT và TNCN. Khai báo chậm nhất ngày 20 hàng tháng.",
    requiredSections: ["Điều kiện đóng thuế", "Cách tính thuế", "Hồ sơ thủ tục"],
    requiredClaims: [
      { claimId: "clm_001", factIds: ["fact_001"], required: true }
    ],
    internalLinkTargets: [],
    schemaTypes: ["Article", "BreadcrumbList"],
    cta: { type: "contact", message: "Liên hệ AutoTax để được tư vấn hồ sơ" },
    imageBriefIds: ["imgbrief_001"],
    authorId: "auth_001",
    riskTier: "low"
  };
}
