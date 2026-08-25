import type { Request, Response, NextFunction } from "express";

/**
 * Admin korumalı uç noktalar için Bearer / X-Admin-Key doğrulaması.
 * ADMIN_API_KEY tanımlı değilse korumalı işlemler reddedilir.
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const configured = process.env.ADMIN_API_KEY?.trim();
  if (!configured) {
    res.status(503).json({
      error:
        "Admin API anahtarı yapılandırılmamış. ADMIN_API_KEY ortam değişkenini tanımlayın.",
    });
    return;
  }

  const headerKey = req.header("x-admin-key")?.trim();
  const auth = req.header("authorization")?.trim();
  const bearer =
    auth && /^Bearer\s+/i.test(auth)
      ? auth.replace(/^Bearer\s+/i, "").trim()
      : undefined;

  const provided = headerKey || bearer;
  if (!provided || provided !== configured) {
    res.status(401).json({
      error: "Yetkisiz. Geçerli bir admin anahtarı gerekli.",
    });
    return;
  }

  next();
}
