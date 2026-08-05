# Katılım Bankacılığı Ürün ve Kampanya Analiz Ajanı

Katılım bankalarının doğal dilde yazılmış kampanya ve ürün metinlerinden finansal
bilgileri otomatik olarak çıkaran, standart bir şemaya normalize eden ve ürünleri
karşılaştırılabilir hâle getiren bir NLP çözümü.

> TEKNOFEST 2026 — Yapay Zekâ Dil Ajanları Yarışması, 2. Senaryo
> `BilisimVadisi2026`

---

## İçindekiler

- [Ne yapıyor](#ne-yapıyor)
- [Hızlı başlangıç](#hızlı-başlangıç)
- [Bağımlılıklar](#bağımlılıklar)
- [Yapılandırma](#yapılandırma)
- [Mimari](#mimari)
- [NLP katmanı](#nlp-katmanı)
- [Veri şeması](#veri-şeması)
- [API sözleşmesi](#api-sözleşmesi)
- [Proje yapısı](#proje-yapısı)
- [Veri seti](#veri-seti)
- [Arayüz](#arayüz)
- [Geliştirme](#geliştirme)
- [Bilinen sınırlar](#bilinen-sınırlar)
- [Yol haritası](#yol-haritası)
- [Dokümantasyon](#dokümantasyon)
- [Lisans](#lisans)

---

## Ne yapıyor

Katılım bankaları kampanyalarını serbest metin olarak yayınlar. Her banka farklı
terminoloji, farklı biçim ve farklı içerik yapısı kullanır. Bu da ürünlerin
karşılaştırılmasını zorlaştırır.

Bu ajan, ham kampanya metnini alıp:

1. **Ön işlemden geçirir** — Türkçe normalizasyon, cümle bölütleme
2. **Terminolojiyi dönüştürür** — faiz → kâr payı, kredi → finansman, dosya masrafı → tahsis ücreti
3. **Finansal bilgileri çıkarır** — kâr payı oranı, vade, tahsis ücreti, tutar, taksit, ödül
4. **Standart formata normalize eder** — `%2,05` · `2.05 %` · `yüzde 2,05` → `0.0205`
5. **Her alanı bir kanıt cümlesine bağlar** — "bu rakam nereden geldi?" sorusunun cevabı
6. **Güven skoru atar** — düşük güvenli alanlar manuel doğrulama kuyruğuna düşer
7. **Ürünleri karşılaştırır** — en düşük kâr payı, en uzun vade, en düşük masraf, en yüksek ödül, en avantajlı

Ayırt edici yanı: **her çıkarılan değer, kaynak metindeki cümleye bağlıdır.** Panelde
bir alanın "Kanıt göster" düğmesine basıldığında ilgili cümle metnin içinde vurgulanır;
vurgulu cümleye tıklandığında da ilgili alan işaretlenir.

---

## Hızlı başlangıç

### Gereksinimler

- **Node.js** 20 veya üzeri
- **npm** 10 veya üzeri
- (İsteğe bağlı) Bir LLM sağlayıcısı — yoksa sistem kural tabanlı çıkarıma düşer

### Kurulum

```bash
git clone https://github.com/yenererr/kat-l-m-.git
cd kat-l-m-
npm install
cp .env.example .env
```

`.env` dosyasını düzenleyip API anahtarınızı girin (bkz. [Yapılandırma](#yapılandırma)).
**Anahtar girmeseniz de uygulama çalışır** — bu durumda kural tabanlı çıkarıcı devreye
girer.

### Çalıştırma

```bash
npm run dev
```

Tarayıcıdan **http://localhost:3000** adresini açın.

### Üretim derlemesi

```bash
npm run build
npm start
```

---

## Bağımlılıklar

### Çalışma zamanı

| Paket | Sürüm | Görev |
|---|---|---|
| `react`, `react-dom` | ^19.0.1 | Arayüz |
| `express` | ^4.21.2 | HTTP sunucusu ve `/api/extract` uç noktası |
| `vite` | ^6.2.3 | Geliştirme sunucusu ve derleme |
| `@vitejs/plugin-react` | ^5.0.4 | React desteği |
| `@tailwindcss/vite`, `tailwindcss` | ^4.1.14 | Tasarım token sistemi ve stiller |
| `lucide-react` | ^0.546.0 | İkonlar (SVG) |
| `motion` | ^12.23.24 | Hareket ve geçişler |
| `dotenv` | ^17.2.3 | Ortam değişkenleri |

### Geliştirme

| Paket | Sürüm | Görev |
|---|---|---|
| `typescript` | ~5.8.2 | Tip denetimi |
| `tsx` | ^4.21.0 | TypeScript sunucusunu doğrudan çalıştırma |
| `esbuild` | ^0.25.0 | Sunucu paketleme |
| `@types/node`, `@types/express` | — | Tip tanımları |

**Fontlar depoya dâhildir** ve `public/fonts/` altından sunulur — CDN bağımlılığı yoktur.
Inter ve JetBrains Mono, SIL Open Font License 1.1 ile lisanslıdır; latin-ext alt kümesi
Türkçe glifleri (ğ Ğ ş Ş ı İ ç Ç ö Ö ü Ü) kapsar.

---

## Yapılandırma

`.env` dosyası:

```ini
# LLM sağlayıcısı (OpenAI uyumlu endpoint)
NVIDIA_API_KEY=nvapi-XXXXXXXXXXXXXXXX
NVIDIA_MODEL=meta/llama-3.3-70b-instruct
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
```

### Yerel (on-premise) çalıştırma

Sunucu OpenAI uyumlu bir endpoint kullandığından, yerel bir model sunucusuna
yönlendirilebilir. [Ollama](https://ollama.com) ile:

```bash
ollama pull qwen3:4b
```

```ini
NVIDIA_BASE_URL=http://localhost:11434/v1
NVIDIA_MODEL=qwen3:4b
NVIDIA_API_KEY=ollama
```

Bu yapılandırmada hiçbir veri kurum dışına çıkmaz. `qwen3:4b` yaklaşık 2,5 GB'dır ve
4 GB VRAM'li bir GPU'ya sığar; Apache 2.0 lisanslıdır.

Anahtar tanımlı değilse sunucu otomatik olarak kural tabanlı çıkarıcıya düşer.

---

## Mimari

```
Ham kampanya metni
        │
        ▼
┌───────────────────────────────────────────────┐
│  1. ÖN İŞLEME            src/nlp/normalize.ts │
│     Unicode, tırnak, boşluk, Türkçe küçültme  │
├───────────────────────────────────────────────┤
│  2. CÜMLE BÖLÜTLEME      src/nlp/segment.ts   │
│     Ondalık / tarih / kısaltma korumalı       │
├───────────────────────────────────────────────┤
│  3. TERMİNOLOJİ EŞLEME   src/nlp/lexicon.ts   │
│     Sözlükbirim tabanlı, çekim ekine toleranslı│
├───────────────────────────────────────────────┤
│  4. KURAL TABANLI ÇIKARIM src/nlp/extract.ts  │
│     Oran, vade, ücret (olumsuzluk), tutar     │
├───────────────────────────────────────────────┤
│  5. DİL MODELİ           server.ts            │
│     Şema kısıtlı; kalan alanlar için          │
├───────────────────────────────────────────────┤
│  6. ÇAPRAZ DOĞRULAMA     src/nlp/extract.ts   │
│     Kural ≠ model → güven düşer               │
├───────────────────────────────────────────────┤
│  7. KANIT HİZALAMA       src/nlp/align.ts     │
│     Birebir → normalize → Jaccard örtüşmesi   │
└───────────────────────────────────────────────┘
        │
        ▼
Yapılandırılmış JSON  →  Panel · Karşılaştırma · Dashboard
```

Kural katmanının dil modelinden **önce** çalışması bilinçli bir tercihtir: kolay vakalar
deterministik ve milisaniyelik çözülür, dil modeli yalnızca varyasyonlu ifadeler için
devreye girer, ve iki katmanın karşılaştırılması bağımsız bir doğrulama sağlar.

---

## NLP katmanı

`src/nlp/` altındaki modüller React'ten bağımsızdır ve hem istemci hem sunucu
tarafından kullanılır.

### `normalize.ts` — Türkçe metin normalizasyonu

JavaScript'in yerleşik `toLowerCase()` metodu Türkçe alfabeyi tanımaz:

```js
"FAİZ ORANI".toLowerCase()    // → "fai̇z oranı"   (i + U+0307 birleşik nokta)
"DOSYA MASRAFI".toLowerCase() // → "dosya masrafi" (noktasız I → ASCII i)
```

Sonuç: `/\bfaiz\b/` deseni eşleşmez ve büyük harfli kampanya başlıklarında terim
tespiti sessizce başarısız olur. Bu modül tüm küçültme işlemlerini `tr-TR` yereliyle
yapar.

| Fonksiyon | Görev |
|---|---|
| `kucult`, `buyult` | Türkçe kurallarına göre harf dönüşümü |
| `sapkaSadelestir` | `kâr payı` ↔ `kar payı` denkliği |
| `asciiKatla` | Eşleştirme için ASCII indirgeme |
| `metinTemizle` | Depolama için tam ön işleme hattı |
| `eslesmeAnahtari` | Karşılaştırma için agresif sadeleştirme |
| `sayiCoz` | `2,05` · `1.000.000` · `5.000.000,50` |
| `yaziliSayiCoz` | `"iki milyon beş yüz bin"` → `2500000` |
| `yuzdeCoz` | `%2,05` · `2.05 %` · `yüzde 2,05` → `0.0205` |
| `paraBirimiCoz` | `₺` · `TL` · `Türk Lirası` → `TRY` |

### `segment.ts` — Cümle bölütleme

Naif nokta bölme finans metinlerinde çöker. Bölütleyici şunları cümle sonu saymaz:

- Ondalık ayracı: `%2,05`, `2.05`
- Tarih: `31.12.2026`
- Binlik ayracı: `1.000.000`
- Kısaltmalar (25 adet): `vb.` `Sn.` `md.` `örn.` `Ltd.` …
- Baş harf: `A. Bankası`
- Sıra sayısı: `1. taksit`

Her cümle için kaynak metindeki `(başlangıç, bitiş)` karakter aralığı üretilir.

### `lexicon.ts` — Terminoloji eşleme ve olumsuzluk

Türkçe eklemeli bir dil olduğundan sabit kelime araması yetmez. Sözlük kök hâlinde
tutulur, eşleştirme çekim ekine toleranslıdır: `faiz`, `faizi`, `faizde`, `faizli`
tek girdiyle yakalanır.

| Konvansiyonel | Katılım karşılığı | Alan |
|---|---|---|
| faiz | kâr payı | `kar_payi_orani` |
| kredi | finansman | `urun_turu` |
| mevduat | katılım fonu | `urun_turu` |
| dosya masrafı | tahsis ücreti | `tahsis_ucreti` |
| kart puanı | ödül | `odul_miktari` |

**Olumsuzluk tespiti** — "tahsis ücreti alınmaz" şemada `0` değerine karşılık gelir ve
pozitif bir sayı aranarak bulunamaz. Türkçede olumsuzluk çekim ekiyle taşınır:

| Ek | Örnek | Değer |
|---|---|---|
| `-maz` / `-mez` | alınmaz, edilmez | 0 |
| `-mıyor` / `-muyor` | alınmıyor | 0 |
| `-mama-` / `-meme-` | alınmamaktadır | 0 |
| `-makta` / `-mekte` | **alınmaktadır** | pozitif |

Son satır kritiktir: naif bir `alınm` araması ikisini ayırt edemez ve ücreti hatalı
biçimde sıfırlar.

### `extract.ts` — Kural tabanlı bilgi çıkarımı

Deterministik birinci katman. Bağlam denetimleriyle çalışır: oranın gerçekten kâr
payına ait olup olmadığı, vadenin taksit sayısıyla karışıp karışmadığı, ücret
cümlesinin tutar cümlesinden ayrılması.

Şartname kuralı doğrudan kodlanmıştır: metinde "aylık" veya "yıllık" geçmiyorsa
`periyot: "belirsiz"` atanır ve güven skoru en fazla `0.5` olur.

`caprazDogrula` fonksiyonu kural ve model çıktısını karşılaştırır; %1 tolerans içinde
uyuşma güveni korur, uyuşmazlık güveni yarıya indirir.

### `align.ts` — Kanıt hizalama

Modelin döndürdüğü alıntı kaynak metinle birebir aynı olmayabilir. Üç aşamalı:

1. **Birebir arama** — en hızlı, skor 1.0
2. **Normalize edilmiş metin** — aksan, tırnak ve noktalama farklarına dayanıklı, skor 0.9
3. **Cümle düzeyinde Jaccard örtüşmesi** — `J(A,B) = |A∩B| / |A∪B|`, eşik 0.45

---

## Veri şeması

`src/types.ts` içinde tanımlıdır ve değiştirilmemelidir.

```ts
interface KatilimUrunu {
  urun_adi: string | null;
  urun_turu: 'konut_finansmani' | 'tasit_finansmani' | 'ihtiyac_finansmani'
           | 'kart' | 'katilim_fonu' | 'yatirim' | 'alisveris_puani' | 'diger';
  musteri_segmenti: ('yeni_musteri' | 'mevcut_musteri' | 'kurumsal'
                   | 'kobi' | 'genc' | 'emekli' | 'tumu')[];
  kampanya_baslangic: string | null;   // ISO 8601
  kampanya_bitis: string | null;
  terimler: {
    kar_payi_orani: TermDetail<number>;  // deger + periyot
    vade_ay:        TermDetail<null>;    // min / max, her zaman AY
    tahsis_ucreti:  TermDetail<number>;  // deger + tipi + para_birimi
    tutar:          TermDetail<null>;    // min / max
    taksit_sayisi:  TermDetail<number>;
    odul:           TermDetail<number>;
  };
  kanitlar: Record<string, string>;      // alan → kaynak cümle
  terim_esleme_uygulandi: boolean;
  ortalama_guven: number;                // 0–1
  manuel_dogrulama_gerekli: boolean;     // ortalama_guven < 0.6
  notlar: string | null;
}

interface TermDetail<T> {
  ham: string | null;        // metinde geçtiği hâli
  deger?: T | null;          // normalize edilmiş değer
  min?: number | null;
  max?: number | null;
  periyot?: 'aylik' | 'yillik' | 'belirsiz' | null;
  tipi?: 'sabit' | 'oransal' | 'yok' | 'belirsiz' | null;
  para_birimi?: 'TRY' | 'USD' | 'EUR' | string | null;
  guven: number;             // 0–1
}
```

### Normalizasyon kuralları

| Girdi | Çıktı |
|---|---|
| `%2,05` · `2.05 %` · `yüzde 2,05` | `0.0205` |
| `10 yıl` | `120` (vadeler her zaman ay) |
| `36 aya varan` | `max: 36, min: null` |
| `Tahsis ücreti alınmaz` | `deger: 0, tipi: "yok"` |
| `500 TL` · `500₺` · `beş yüz Türk Lirası` | `500`, `para_birimi: "TRY"` |
| Periyot belirtilmemiş | `periyot: "belirsiz"`, `guven ≤ 0.5` |

### Güven skoru ölçeği

| Aralık | Anlamı |
|---|---|
| 0.9 – 1.0 | Metinde açık ve tek anlamlı yazılı |
| 0.6 – 0.8 | Biçim veya birim hafif yoruma açık |
| 0.3 – 0.5 | Dolaylı çıkarım veya periyot belirsiz |
| 0.0 | Alan metinde hiç geçmiyor |

---

## API sözleşmesi

### `POST /api/extract`

**İstek**

```json
{ "text": "Konut finansmanında aylık kâr payı oranı %2,05'ten başlıyor..." }
```

**Yanıt**

```json
{
  "urunler": [
    {
      "urun_adi": "Konut Finansmanı",
      "urun_turu": "konut_finansmani",
      "musteri_segmenti": ["yeni_musteri", "mevcut_musteri"],
      "kampanya_baslangic": null,
      "kampanya_bitis": "2026-09-30",
      "terimler": {
        "kar_payi_orani": { "ham": "%2,05", "deger": 0.0205, "periyot": "aylik", "guven": 0.9 },
        "vade_ay":        { "ham": "120 ay", "min": null, "max": 120, "guven": 0.95 }
      },
      "kanitlar": {
        "kar_payi_orani": "Konut finansmanında aylık kâr payı oranı %2,05'ten başlıyor."
      },
      "terim_esleme_uygulandi": false,
      "ortalama_guven": 0.93,
      "manuel_dogrulama_gerekli": false,
      "notlar": null
    }
  ],
  "meta": {
    "duration_ms": 1240,
    "extracted_at": "2026-08-05T08:51:00.000Z",
    "conventional_terms_detected": []
  }
}
```

**Hata** — `500` ile `{ "error": "..." }`

### `GET /api/health`

```json
{
  "status": "ok",
  "service": "katilim-bilgi-cikarim-ajani",
  "provider": "nvidia-nim",
  "model": "meta/llama-3.3-70b-instruct",
  "api_key_configured": true
}
```

---

## Proje yapısı

```
.
├── server.ts                  Express sunucusu, /api/extract, kural tabanlı yedek
├── index.html                 Font önyüklemesi, tema flash önleme
├── docs/
│   ├── nlp-mimarisi.tex/.pdf              NLP yöntem haritası
│   └── eksiklikler-ve-yol-haritasi.tex/.pdf
├── public/fonts/              Self-hosted Inter ve JetBrains Mono (woff2)
└── src/
    ├── App.tsx                Uygulama kabuğu, sekme yönetimi, durum
    ├── index.css              Tailwind v4 token katmanı, açık/koyu tema
    ├── types.ts               Şema (değiştirilmez)
    ├── data/samples.ts        Örnek kampanya metinleri
    ├── nlp/                   ── NLP KATMANI ──
    │   ├── normalize.ts       Türkçe metin normalizasyonu
    │   ├── segment.ts         Cümle bölütleme, belirteçleme
    │   ├── lexicon.ts         Terminoloji eşleme, olumsuzluk tespiti
    │   ├── extract.ts         Kural tabanlı çıkarım, çapraz doğrulama
    │   └── align.ts           Kanıt hizalama
    ├── lib/
    │   └── compare.ts         Karşılaştırma motoru (5 kriter)
    └── components/
        ├── Sidebar.tsx        Navigasyon (masaüstü kenar / mobil alt çubuk)
        ├── Header.tsx         Üst çubuk, tema, dışa aktarma
        ├── Dashboard.tsx      Genel bakış, KPI, dağılımlar, bulgular
        ├── TextInspector.tsx  Metin girişi ve kanıt vurgulama
        ├── ProductCard.tsx    Çıkarılan alanlar, güven, doğrulama
        ├── CampaignList.tsx   Kampanya kartları, filtre, seçim
        ├── CompareView.tsx    Karşılaştırma matrisi
        ├── JsonViewer.tsx     Ham JSON, kopyalama, indirme
        ├── TerminologyGuide.tsx  Kural ve standart rehberi
        ├── ConfidenceRing.tsx    Güven görselleştirme
        ├── AnimatedNumber.tsx    Sayısal geçişler
        └── Toast.tsx             Bildirimler
```

---

## Veri seti

Şu an depoda `src/data/samples.ts` içinde **6 örnek kampanya metni** bulunmaktadır.
Bu metinler geliştirme ve demo amaçlıdır.

> **Durum:** BDDK'nın [katılım bankaları listesindeki](https://www.bddk.org.tr/Kurulus/Liste/77)
> kuruluşların resmî sitelerinden toplanacak gerçek veri seti henüz hazırlanmamıştır.
> Toplama hattı yol haritasında 1. sıradadır; veri seti tamamlandığında bu bölüme
> herkese açık indirme bağlantısı eklenecektir.

---

## Arayüz

Altı bölümden oluşur:

| Bölüm | İçerik |
|---|---|
| **Genel Bakış** | KPI şeridi, kriter bazlı kazananlar, ürün türü ve banka dağılımı, yaklaşan bitişler, otomatik bulgular |
| **Çıkarım** | Metin girişi, okuma/düzenleme modu, çıkarılan alanlar, kanıt vurgulama, alan doğrulama |
| **Kampanyalar** | Kart listesi, filtreler, karşılaştırma için çoklu seçim |
| **Karşılaştırma** | Kriter × banka matrisi, kazanan işaretleri, satır bazlı kanıt gösterimi |
| **JSON** | Ham çıktı, kopyalama, `.json` indirme, manuel düzenleme |
| **Kurallar** | Terim eşleme matrisi, normalizasyon kuralları, güven ölçeği |

**Erişilebilirlik ve kullanım**

- WCAG 2.1 AA kontrast oranları, açık ve koyu temada ayrı doğrulanmış
- Gerçek `tablist` / `tab` / `tabpanel` semantiği, ok tuşlarıyla gezinme
- Tüm etkileşimli öğelerde görünür odak halkası, en az 44 px dokunma hedefi
- Renk tek başına anlam taşımaz; her durum göstergesinde ikon ve metin de bulunur
- `prefers-reduced-motion` desteklenir
- 375 px genişlikte yatay taşma yoktur
- **Ctrl/Cmd + Enter** ile çıkarım başlatılır

---

## Geliştirme

```bash
npm run dev      # Geliştirme sunucusu (http://localhost:3000)
npm run lint     # TypeScript tip denetimi (tsc --noEmit)
npm run build    # Üretim derlemesi
npm start        # Derlenmiş sunucuyu çalıştır
npm run clean    # dist/ temizliği
```

NLP modülleri saf TypeScript'tir ve doğrudan çalıştırılabilir:

```bash
npx tsx -e "import('./src/nlp').then(n => console.log(n.kuralTabanliCikar('Aylık kâr payı %2,05, tahsis ücreti alınmaz.')))"
```

---

## Bilinen sınırlar

- **Kalıcı depo yok.** Çıkarım sonuçları ve doğrulama işaretleri yalnızca bellekte tutulur; sayfa yenilendiğinde kaybolur.
- **Kural motoru yedek konumunda.** Şu an dil modeli birincil çıkarıcıdır; kural katmanı yalnızca API anahtarı yoksa devreye girer. Katmanların yer değiştirmesi planlanmaktadır.
- **Banka adı şemada yok.** Karşılaştırmada banka adı, metnin örnek şablonlarla eşleştirilmesinden türetilir.
- **Kampanya türü sınıflandırması yok.** Yalnızca ürün türü çıkarılmaktadır.
- **Chatbot yok.**
- **Bulut modeli kullanılıyor.** Yerel çalıştırma desteklenir ancak varsayılan yapılandırma harici bir servise gider.
- **Doğruluk ölçümü yok.** Altın değerlendirme seti hazırlanmamıştır.

---

## Yol haritası

| Sıra | İş | Karşıladığı madde |
|---|---|---|
| 1 | Yerel modele geçiş (Ollama / vLLM) | 5.9 On-premise |
| 2 | SQLite kalıcı depo, şema genişletme (`banka_adi`, `kampanya_turu`, `avantajlar`) | 5.3 |
| 3 | Veri toplama hattı (BDDK listesi, kaynak defteri, kırılganlık alarmı) | 5.1 |
| 4 | Kural motorunun birinci katmana taşınması | 5.3, teknik kriter |
| 5 | Altın değerlendirme seti ve F1 raporu | Model başarısı |
| 6 | Kampanya türü sınıflandırıcı (TF-IDF + doğrusal model) | 5.4 |
| 7 | Chatbot (niyet sınıflandırma + slot doldurma + sorguya çevirme) | Senaryo kapsamı |
| 8 | Örtük ifade kalıp sözlüğü | 5.2 |

Ayrıntılar için [docs/eksiklikler-ve-yol-haritasi.pdf](docs/eksiklikler-ve-yol-haritasi.pdf).

---

## Dokümantasyon

| Belge | İçerik |
|---|---|
| [docs/nlp-mimarisi.pdf](docs/nlp-mimarisi.pdf) | NLP yöntemlerinin şartname maddeleriyle eşlenmesi, işleme hattı, ölçüm planı |
| [docs/eksiklikler-ve-yol-haritasi.pdf](docs/eksiklikler-ve-yol-haritasi.pdf) | Şartname uyum tablosu, eksiklik listesi, fazlı yol haritası |

LaTeX kaynakları aynı dizindedir ve `pdflatex` ile derlenebilir.

---

## Lisans

Bu proje **Apache License 2.0** ile lisanslanacaktır (`LICENSE` dosyası eklenecektir).

Üçüncü taraf varlıklar:

- **Inter** — SIL Open Font License 1.1
- **JetBrains Mono** — SIL Open Font License 1.1
- **Lucide** ikonları — ISC License
