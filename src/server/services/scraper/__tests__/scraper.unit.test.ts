import { describe, expect, it, vi } from "vitest";
import { BANK_SOURCE_CONFIGS } from "../bankSourceConfig";
import {
  isBlockedConventionalDomain,
  validateOfficialBankUrl,
} from "../urlGuard";
import { cleanHtmlToDocument, hashContent } from "../contentCleaner";
import { classifyByUrlAndText } from "../adapters/baseAdapter";
import { listAdapters, getAdapter } from "../adapters";
import type { ScrapedPage } from "../scraperTypes";

describe("bank source config", () => {
  it("on bir katılım bankası yapılandırması vardır", () => {
    expect(BANK_SOURCE_CONFIGS).toHaveLength(11);
    expect(BANK_SOURCE_CONFIGS.every((b) => b.enabled)).toBe(true);
  });
});

describe("domain allowlist", () => {
  it("yalnızca katılım bankası domainlerini kabul eder", () => {
    expect(validateOfficialBankUrl("https://www.vakifkatilim.com.tr/tr/x").ok).toBe(
      true,
    );
    expect(validateOfficialBankUrl("https://www.ziraatkatilim.com.tr/").ok).toBe(
      true,
    );
  });

  it("Vakıf Katılım ile VakıfBank karıştırılmaz", () => {
    expect(isBlockedConventionalDomain("www.vakifbank.com.tr")).toBe(true);
    expect(validateOfficialBankUrl("https://www.vakifbank.com.tr/").ok).toBe(
      false,
    );
    expect(
      validateOfficialBankUrl("https://www.vakifkatilim.com.tr/tr/kampanyalar").ok,
    ).toBe(true);
  });

  it("Ziraat Katılım ile Ziraat Bankası karıştırılmaz", () => {
    expect(isBlockedConventionalDomain("ziraatbank.com.tr")).toBe(true);
    expect(validateOfficialBankUrl("https://www.ziraatbank.com.tr/").ok).toBe(
      false,
    );
    expect(
      validateOfficialBankUrl("https://www.ziraatkatilim.com.tr/bireysel").ok,
    ).toBe(true);
  });

  it("üçüncü taraf kaynakları reddeder", () => {
    expect(validateOfficialBankUrl("https://example.com/kampanya").ok).toBe(
      false,
    );
    expect(validateOfficialBankUrl("https://kredi.com.tr/x").ok).toBe(false);
  });

  it("SSRF engeller", () => {
    expect(validateOfficialBankUrl("http://127.0.0.1/").ok).toBe(false);
    expect(validateOfficialBankUrl("http://localhost/admin").ok).toBe(false);
    expect(validateOfficialBankUrl("http://169.254.169.254/").ok).toBe(false);
  });
});

describe("content cleaner + hash", () => {
  it("menü/footer/cookie metnini temizler", () => {
    const html = `
      <html><body>
        <nav>Ana menü</nav>
        <main><h1>Konut Finansmanı</h1><p>Aylık kâr payı oranı %1,90</p></main>
        <footer>Tüm hakları saklıdır</footer>
        <div class="cookie">Çerez politikası</div>
      </body></html>`;
    const doc = cleanHtmlToDocument(html);
    expect(doc.text).toMatch(/Konut Finansmanı/);
    expect(doc.text).toMatch(/%1,90/);
    expect(doc.text.toLocaleLowerCase("tr-TR")).not.toMatch(/çerez politikası/);
  });

  it("hash değişmediyse aynı kalır", () => {
    const a = hashContent("aynı içerik");
    const b = hashContent("aynı içerik");
    expect(a).toBe(b);
    expect(hashContent("farklı")).not.toBe(a);
  });
});

describe("classification", () => {
  it("kart kampanyasını finansman olarak sınıflandırmaz", () => {
    expect(
      classifyByUrlAndText(
        "https://www.ziraatkatilim.com.tr/kart-kampanyalari",
        "Bankkart puan kampanyası",
      ),
    ).toBe("card_campaign");
  });

  it("indirim oranını kâr payı kategorisine koymaz", () => {
    expect(
      classifyByUrlAndText(
        "https://hayatfinans.com.tr/kampanyalar/indirim",
        "%20 indirim kampanyası alışverişte",
      ),
    ).toBe("discount_campaign");
  });

  it("konut finansmanını doğru sınıflandırır", () => {
    expect(
      classifyByUrlAndText(
        "https://www.kuveytturk.com.tr/kendim-icin/finansmanlar/konut-finansmanlari/ilk-evim-konut-finansmani",
        "Konut finansmanı kâr payı",
      ),
    ).toBe("housing_finance");
  });
});

describe("adapters", () => {
  it("on adapter mevcuttur", () => {
    expect(listAdapters()).toHaveLength(10);
  });

  it("bir adapter bozulsa diğerleri çalışır", async () => {
    const broken = getAdapter("adil-katilim");
    const good = getAdapter("kuveyt-turk");
    vi.spyOn(broken, "extractMainContent").mockRejectedValue(new Error("broken"));
    const page: ScrapedPage = {
      requestedUrl: "https://www.kuveytturk.com.tr/kampanyalar/kendim-icin/finansman-kampanyalari",
      finalUrl: "https://www.kuveytturk.com.tr/kampanyalar/kendim-icin/finansman-kampanyalari",
      httpStatus: 200,
      html: `<html><body><main><a href="/kampanyalar/x">Kampanya</a><p>Finansman kampanyası kâr payı</p></main></body></html>`,
      fetchedAt: new Date().toISOString(),
      fetchMethod: "fetch",
    };
    await expect(broken.extractMainContent(page)).rejects.toThrow("broken");
    const doc = await good.extractMainContent(page);
    expect(doc.text.length).toBeGreaterThan(10);
    const links = await good.discoverDetailUrls(page);
    expect(Array.isArray(links)).toBe(true);
  });

  it("fixture HTML ile detay keşfi çalışır", async () => {
    const adapter = getAdapter("dunya-katilim");
    const page: ScrapedPage = {
      requestedUrl: "https://dunyakatilim.com.tr/kampanyalar",
      finalUrl: "https://dunyakatilim.com.tr/kampanyalar",
      httpStatus: 200,
      html: `
        <html><body>
          <main>
            <a href="/kampanyalar/yaz-kampanyasi">Yaz</a>
            <a href="https://evil.com/x">kötü</a>
            <a href="https://www.vakifbank.com.tr/x">konvansiyonel</a>
          </main>
        </body></html>`,
      fetchedAt: new Date().toISOString(),
      fetchMethod: "fetch",
    };
    const links = await adapter.discoverDetailUrls(page);
    expect(links.some((l) => l.includes("yaz-kampanyasi"))).toBe(true);
    expect(links.every((l) => l.includes("dunyakatilim.com.tr"))).toBe(true);
  });
});

describe("expired campaign detection", () => {
  it("süresi dolmuş kampanyayı expired işaretler", async () => {
    const adapter = getAdapter("vakif-katilim");
    const doc = cleanHtmlToDocument(
      `<main><p>Kampanya Süresi Dolmuştur. Bu kampanya sona ermiştir.</p></main>`,
    );
    expect(adapter.detectCampaignStatus(doc)).toBe("expired");
  });
});
