import base64
import json
import os
import re
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple


try:
    import pymupdf as fitz  # type: ignore
except Exception:  # pragma: no cover - package exposes either name by version
    try:
        import fitz  # type: ignore
    except Exception:
        fitz = None

try:
    import pdfplumber  # type: ignore
except Exception:
    pdfplumber = None

try:
    from pypdf import PdfReader  # type: ignore
except Exception:
    PdfReader = None


@dataclass
class ExtractedText:
    text: str
    method: str
    page_count: int
    warnings: List[str]


def get_risk_group(score: int) -> str:
    if score >= 1700:
        return "Çok İyi"
    if score >= 1500:
        return "İyi"
    if score >= 1100:
        return "Az Riskli"
    if score >= 700:
        return "Orta Riskli"
    return "En Riskli"


def calculate_approval_chance(score: Optional[int], delay_count: int, past_due_debt: float, followup_count: int) -> Optional[int]:
    if score is None:
        return None

    if score >= 1700:
        chance = 95
    elif score >= 1500:
        chance = 85
    elif score >= 1200:
        chance = 70
    elif score >= 900:
        chance = 40
    else:
        chance = 15

    if delay_count > 0 or past_due_debt > 0:
        chance = max(10, chance - 25)
    if followup_count > 0:
        chance = max(5, chance - 35)
    return chance


def read_pdf_text(pdf_bytes: bytes) -> ExtractedText:
    warnings: List[str] = []

    if fitz is not None:
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            pages = [page.get_text("text") for page in doc]
            text = "\n".join(pages).strip()
            if text:
                return ExtractedText(text=text, method="pymupdf_text", page_count=len(doc), warnings=warnings)
            warnings.append("PyMuPDF metin katmanı bulamadı.")
        except Exception as exc:
            warnings.append(f"PyMuPDF okuma hatası: {exc}")

    if pdfplumber is not None:
        try:
            import io

            with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                pages = [(page.extract_text() or "") for page in pdf.pages]
            text = "\n".join(pages).strip()
            if text:
                return ExtractedText(text=text, method="pdfplumber_text", page_count=len(pages), warnings=warnings)
            warnings.append("pdfplumber metin katmanı bulamadı.")
        except Exception as exc:
            warnings.append(f"pdfplumber okuma hatası: {exc}")

    if PdfReader is not None:
        try:
            import io

            reader = PdfReader(io.BytesIO(pdf_bytes))
            pages = [(page.extract_text() or "") for page in reader.pages]
            text = "\n".join(pages).strip()
            if text:
                return ExtractedText(text=text, method="pypdf_text", page_count=len(reader.pages), warnings=warnings)
            warnings.append("pypdf metin katmanı bulamadı.")
        except Exception as exc:
            warnings.append(f"pypdf okuma hatası: {exc}")

    warnings.append(
        "PDF içinden okunabilir metin çıkarılamadı. Belge tarama/görsel PDF ise makinede Tesseract OCR kurulması gerekir."
    )
    return ExtractedText(text="", method="none", page_count=0, warnings=warnings)


def compact_lines(text: str) -> List[str]:
    return [re.sub(r"\s+", " ", line).strip() for line in text.splitlines() if line.strip()]


def parse_money(raw: str) -> Optional[float]:
    value = raw.strip()
    if not value or value in {"-", "—", "–"}:
        return 0.0
    if "TL" not in value.upper():
        return None
    match = re.search(r"([\d.]+(?:,\d{1,2})?|\d+)", value)
    if not match:
        return None
    normalized = match.group(1).replace(".", "").replace(",", ".")
    try:
        return float(normalized)
    except ValueError:
        return None


def parse_int(raw: str) -> Optional[int]:
    match = re.search(r"\b(\d{1,4})\b", raw)
    return int(match.group(1)) if match else None


def parse_percent(raw: str) -> Optional[float]:
    match = re.search(r"%\s*([\d.,]+)", raw)
    if not match:
        match = re.search(r"\b([\d.,]+)\s*%", raw)
    if not match:
        return None
    try:
        return float(match.group(1).replace(",", "."))
    except ValueError:
        return None


def evidence_window(lines: List[str], index: int, radius: int = 2) -> str:
    return " / ".join(lines[max(0, index - radius): min(len(lines), index + radius + 1)])


def next_value_after(lines: List[str], index: int, parser, max_ahead: int = 4) -> Tuple[Optional[Any], Optional[str]]:
    for offset in range(0, max_ahead + 1):
        if index + offset >= len(lines):
            break
        value = parser(lines[index + offset])
        if value is not None:
            return value, evidence_window(lines, index)
    return None, None


def find_score(lines: List[str]) -> Tuple[Optional[int], Optional[str]]:
    for idx, line in enumerate(lines):
        if re.search(r"kredi\s+notunuz|findeks\s+kredi\s+notu|kredi\s+notu", line, re.IGNORECASE):
            value, evidence = next_value_after(lines, idx + 1, parse_int, max_ahead=5)
            if isinstance(value, int) and 1 <= value <= 1900 and value not in {2024, 2025, 2026, 2027}:
                return value, evidence or evidence_window(lines, idx)

    joined = " ".join(lines[:80])
    match = re.search(r"(?:Kredi\s+Notunuz|Findeks\s+Kredi\s+Notu|Kredi\s+Notu)\D{0,80}(\d{3,4})", joined, re.IGNORECASE)
    if match:
        score = int(match.group(1))
        if 1 <= score <= 1900 and score not in {2024, 2025, 2026, 2027}:
            return score, match.group(0)

    return None, None


def find_money_field(lines: List[str], patterns: Iterable[str]) -> Tuple[Optional[float], Optional[str]]:
    compiled = [re.compile(pattern, re.IGNORECASE) for pattern in patterns]
    for idx, line in enumerate(lines):
        if any(p.search(line) for p in compiled):
            value, evidence = next_value_after(lines, idx + 1, parse_money, max_ahead=4)
            if value is not None:
                return value, evidence or evidence_window(lines, idx)
            direct = parse_money(line)
            if direct is not None:
                return direct, evidence_window(lines, idx)
    return None, None


def find_int_field(lines: List[str], patterns: Iterable[str]) -> Tuple[Optional[int], Optional[str]]:
    compiled = [re.compile(pattern, re.IGNORECASE) for pattern in patterns]
    for idx, line in enumerate(lines):
        if any(p.search(line) for p in compiled):
            value, evidence = next_value_after(lines, idx + 1, parse_int, max_ahead=4)
            if value is not None:
                return value, evidence or evidence_window(lines, idx)
    return None, None


def find_percent_field(lines: List[str], patterns: Iterable[str]) -> Tuple[Optional[float], Optional[str]]:
    compiled = [re.compile(pattern, re.IGNORECASE) for pattern in patterns]
    for idx, line in enumerate(lines):
        if any(p.search(line) for p in compiled):
            value, evidence = next_value_after(lines, idx, parse_percent, max_ahead=3)
            if value is not None:
                return value, evidence or evidence_window(lines, idx)
    return None, None


def find_text_after(lines: List[str], patterns: Iterable[str], max_ahead: int = 3) -> Tuple[Optional[str], Optional[str]]:
    compiled = [re.compile(pattern, re.IGNORECASE) for pattern in patterns]
    for idx, line in enumerate(lines):
        if any(p.search(line) for p in compiled):
            for offset in range(1, max_ahead + 1):
                if idx + offset < len(lines):
                    candidate = lines[idx + offset].strip()
                    if candidate and not re.match(r"^[\d\s./%-]+$", candidate):
                        return candidate, evidence_window(lines, idx)
    return None, None


def find_report_meta(lines: List[str]) -> Dict[str, Optional[str]]:
    report_date = None
    reference_code = None
    for idx, line in enumerate(lines[:40]):
        if report_date is None and re.search(r"rapor\s+tarih", line, re.IGNORECASE):
            for offset in range(1, 4):
                if idx + offset < len(lines):
                    m = re.search(r"\b\d{2}[./]\d{2}[./]\d{4}\b", lines[idx + offset])
                    if m:
                        report_date = m.group(0)
                        break
        if reference_code is None and re.search(r"referans\s+kodu", line, re.IGNORECASE):
            for offset in range(1, 4):
                if idx + offset < len(lines):
                    m = re.search(r"\b[A-Z0-9]{8,}\b", lines[idx + offset], re.IGNORECASE)
                    if m:
                        reference_code = m.group(0)
                        break
    return {"reportDate": report_date, "referenceCode": reference_code}


def build_bank_offers(score: Optional[int], approval_chance: Optional[int]) -> List[Dict[str, Any]]:
    if score is None or approval_chance is None:
        return []

    return [
        {
            "bankId": "kuveyt-turk",
            "bankName": "Kuveyt Türk",
            "approvalChance": approval_chance,
            "rateDiscountPercent": 0.30 if score >= 1500 else (0.15 if score >= 1200 else 0.0),
            "note": "Skor iyi seviyede; başvuru sırasında indirimli oran ihtimali ayrıca banka tarafından değerlendirilir.",
        },
        {
            "bankId": "turkiye-finans",
            "bankName": "Türkiye Finans",
            "approvalChance": min(99, approval_chance + 5),
            "rateDiscountPercent": 0.25 if score >= 1400 else 0.0,
            "note": "Bazı kampanyalarda Findeks/KKB koşulu bulunur; nihai oran banka onayına bağlıdır.",
        },
        {
            "bankId": "albaraka",
            "bankName": "Albaraka Türk",
            "approvalChance": approval_chance,
            "rateDiscountPercent": 0.20 if score >= 1500 else 0.0,
            "note": "Skor ve gecikme görünümü başvuru değerlendirmesinde olumlu/olumsuz etki eder.",
        },
        {
            "bankId": "vakif-katilim",
            "bankName": "Vakıf Katılım",
            "approvalChance": approval_chance,
            "rateDiscountPercent": 0.15 if score >= 1500 else 0.0,
            "note": "Finansman başvurusunda gelir, mevcut borç ve teminat bilgisiyle birlikte değerlendirilir.",
        },
        {
            "bankId": "ziraat-katilim",
            "bankName": "Ziraat Katılım",
            "approvalChance": approval_chance,
            "rateDiscountPercent": 0.15 if score >= 1500 else 0.0,
            "note": "Findeks sonucu tek başına onay değildir; şube/dijital başvuru kararı belirleyicidir.",
        },
    ]


def analyze_findeks_pdf_bytes(pdf_bytes: bytes, monthly_income_tl: Optional[float] = None) -> Dict[str, Any]:
    extracted = read_pdf_text(pdf_bytes)
    lines = compact_lines(extracted.text)
    evidence: List[Dict[str, str]] = []
    warnings = list(extracted.warnings)

    score, score_evidence = find_score(lines)
    if score_evidence:
        evidence.append({"field": "score", "label": "Findeks kredi notu", "text": score_evidence})

    total_limit, ev_total_limit = find_money_field(lines, [r"^toplam\s+limit", r"^limitler$"])
    if ev_total_limit:
        evidence.append({"field": "totalLimitTl", "label": "Toplam limit", "text": ev_total_limit})

    available_limit, ev_available_limit = find_money_field(lines, [r"kullan\S*labilir\s+limit"])
    if ev_available_limit:
        evidence.append({"field": "availableLimitTl", "label": "Kullanılabilir limit", "text": ev_available_limit})

    total_debt, ev_total_debt = find_money_field(lines, [r"^toplam\s+bor", r"^bor\S*lar$"])
    if ev_total_debt:
        evidence.append({"field": "totalDebtTl", "label": "Toplam borç", "text": ev_total_debt})

    past_due_debt, ev_past_due = find_money_field(lines, [r"gecikmedeki\s+toplam\s+bor", r"g\S*ncel\s+gecikmedeki\s+bor"])
    if ev_past_due:
        evidence.append({"field": "pastDueDebtTl", "label": "Gecikmedeki borç", "text": ev_past_due})

    delay_count, ev_delay_count = find_int_field(lines, [r"gecikmedeki\s+hesap\s+say"])
    if ev_delay_count:
        evidence.append({"field": "delayCount", "label": "Gecikmedeki hesap sayısı", "text": ev_delay_count})

    followup_count, ev_followup_count = find_int_field(lines, [r"takibe\s+al\S*nm\S*\s+kredi\s+say"])
    if ev_followup_count:
        evidence.append({"field": "followupCount", "label": "Takipteki kredi sayısı", "text": ev_followup_count})

    followup_debt, ev_followup_debt = find_money_field(lines, [r"takibe\s+al\S*nm\S*\s+kredilerin\s+bakiye"])
    if ev_followup_debt:
        evidence.append({"field": "followupDebtTl", "label": "Takipteki kredi bakiyesi", "text": ev_followup_debt})

    debt_limit_ratio, ev_ratio = find_percent_field(lines, [r"bor\S*\s*/\s*limit\s+oran", r"limit\s+kullan\S*m\s+oran"])
    if ev_ratio:
        evidence.append({"field": "debtLimitRatioPercent", "label": "Borç / limit oranı", "text": ev_ratio})

    worst_payment_status, ev_worst = find_text_after(lines, [r"en\s+olumsuz\s+durum"])
    if ev_worst:
        evidence.append({"field": "worstPaymentStatus", "label": "Ödeme tarihçesi", "text": ev_worst})

    meta = find_report_meta(lines)
    income = float(monthly_income_tl or 60000.0)
    delay_count_value = int(delay_count or 0)
    past_due_value = float(past_due_debt or 0.0)
    followup_count_value = int(followup_count or 0)
    approval_chance = calculate_approval_chance(score, delay_count_value, past_due_value, followup_count_value)
    estimated_monthly_debt = float(total_debt or 0.0) * 0.05
    dti_percent = round((estimated_monthly_debt / income) * 100, 1) if income > 0 else 0.0

    if extracted.method == "none":
        parsing_status = "failed"
    elif score is None:
        parsing_status = "partial"
        warnings.append("PDF metni okundu ancak Findeks kredi notu bulunamadı; sonuçta skor bazlı onay tahmini üretilmedi.")
    else:
        parsing_status = "parsed"

    risk_group = get_risk_group(score) if score is not None else "Okunamadı"
    summary = (
        f"Findeks Notunuz **{score} ({risk_group})**. "
        f"Rapor metninden {extracted.method} yöntemiyle okundu."
        if score is not None
        else "PDF metni okundu ancak Findeks kredi notu güvenilir şekilde bulunamadı."
    )

    return {
        "isPdfExtracted": extracted.method != "none",
        "isScoreExtracted": score is not None,
        "parsingStatus": parsing_status,
        "extractionMethod": extracted.method,
        "pageCount": extracted.page_count,
        "textLength": len(extracted.text),
        "reportDate": meta["reportDate"],
        "referenceCode": meta["referenceCode"],
        "score": score,
        "riskGroup": risk_group,
        "totalLimitTl": total_limit,
        "availableLimitTl": available_limit,
        "totalDebtTl": total_debt,
        "pastDueDebtTl": past_due_debt if past_due_debt is not None else 0.0,
        "delayCount": delay_count_value,
        "followupCount": followup_count_value,
        "followupDebtTl": followup_debt if followup_debt is not None else 0.0,
        "debtLimitRatioPercent": debt_limit_ratio,
        "worstPaymentStatus": worst_payment_status,
        "approvalChancePercent": approval_chance,
        "monthlyIncomeTl": income,
        "dtiPercent": dti_percent,
        "dtiStatus": "Uygun" if dti_percent <= 50 else "Riskli (BDDK %50 Limitini Aşıyor)",
        "bankOffers": build_bank_offers(score, approval_chance),
        "summaryMessage": summary,
        "warnings": warnings,
        "evidence": evidence[:12],
    }


def analyze_pdf_file(pdf_path_or_b64: str, income: float) -> Dict[str, Any]:
    if os.path.exists(pdf_path_or_b64):
        with open(pdf_path_or_b64, "rb") as f:
            pdf_bytes = f.read()
    else:
        pdf_bytes = base64.b64decode(pdf_path_or_b64)
    return analyze_findeks_pdf_bytes(pdf_bytes, monthly_income_tl=income)


def dumps_result(result: Dict[str, Any]) -> str:
    return json.dumps(result, ensure_ascii=False)
