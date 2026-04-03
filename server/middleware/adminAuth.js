/**
 * ADMIN_API_KEY가 설정된 경우 X-Admin-Key 또는 Authorization: Bearer 로 검증합니다.
 * 프로덕션에서 키가 없으면 관리자 API를 비활성화합니다.
 */
function requireAdminAuth(req, res, next) {
  const key = process.env.ADMIN_API_KEY?.trim();
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      return res.status(503).json({ error: "관리자 API가 설정되지 않았습니다." });
    }
    console.warn(
      "[order-app] ADMIN_API_KEY가 없어 개발 모드에서 관리자 API가 공개됩니다."
    );
    return next();
  }
  const auth = req.get("Authorization");
  const bearer = auth && /^Bearer\s+(.+)$/i.exec(auth)?.[1];
  const sent = (req.get("X-Admin-Key") || bearer || "").trim();
  if (sent !== key) {
    return res.status(401).json({ error: "인증이 필요합니다." });
  }
  next();
}

module.exports = { requireAdminAuth };
