import re
import fitz  # PyMuPDF
from typing import Dict, Any, List, Optional

def get_risk_group_by_score(score: int) -> str:
    """Findeks skor aralığına göre risk grubunu belirler."""
    if score >= 1700:
        return "Çok İyi"
    elif score >= 1500:
        return "İyi"
    elif score >= 1100:
        return "Az Riskli"
    elif score >= 700:
        return "Orta Riskli"
    else:
        return "En Riskli"

def parse_findeks_pdf_bytes(pdf_bytes: bytes, monthly_income_tl: Optional[float] = None) -> Dict[str, Any]:
    """
    Findeks PDF Raporunu PyMuPDF (fitz) ile okur.
    Metinden Findeks Notu, Borç, Limit ve Risk Grubu bilgilerini çıkarır.
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    full_text = ""
    for page in doc:
        full_text += page.get_text() + "\n"

    # Regex ile Findeks Notunu bul (1-1900 arası sayı)
    score = None
    
    # 1. 'Findeks Kredi Notu' etiketinin hemen yanındaki/altındaki sayı
    score_match = re.search(r'(?:Findeks\s*Kredi\s*Notu|Kredi\s*Notu|Notunuz)[\s:]*(\d{3,4})', full_text, re.IGNORECASE)
    if score_match:
        val = int(score_match.group(1))
        if 1 <= val <= 1900:
            score = val

    # 2. Eğer ilk regex bulamadıysa, 1-1900 arası izole 4 haneli sayı
    if score is None:
        all_numbers = re.findall(r'\b(1[0-9]{3}|[1-9][0-9]{2})\b', full_text)
        for num_str in all_numbers:
            num = int(num_str)
            if 100 <= num <= 1900:
                score = num
                break

    # Varsayılan skor (bulunamazsa varsayılan 1450 - Az Riskli kabul edilir)
    if score is None:
        score = 1450

    risk_group = get_risk_group_by_score(score)

    # Limit ve Borç Analizi
    total_limit = 0.0
    total_debt = 0.0
    past_due_debt = 0.0
    delay_count = 0

    # Limit tutarları (TL)
    limit_match = re.search(r'(?:Toplam\s*Limit|Limit\s*Toplamı)[\s:]*([\d\.,]+)', full_text, re.IGNORECASE)
    if limit_match:
        try:
            total_limit = float(limit_match.group(1).replace('.', '').replace(',', '.'))
        except ValueError:
            pass

    # Borç tutarları (TL)
    debt_match = re.search(r'(?:Toplam\s*Borç|Risk\s*Toplamı|Borç\s*Bakiyesi)[\s:]*([\d\.,]+)', full_text, re.IGNORECASE)
    if debt_match:
        try:
            total_debt = float(debt_match.group(1).replace('.', '').replace(',', '.'))
        except ValueError:
            pass

    # Gecikme borcu (TL)
    delay_match = re.search(r'(?:Gecikmedeki\s*Borç|Gecikme\s*Tutar)[\s:]*([\d\.,]+)', full_text, re.IGNORECASE)
    if delay_match:
        try:
            past_due_debt = float(delay_match.group(1).replace('.', '').replace(',', '.'))
        except ValueError:
            pass

    # Gecikme Adedi
    delay_cnt_match = re.search(r'(?:Gecikmeli\s*Hesap\s*Sayısı|Gecikme\s*Adedi)[\s:]*(\d+)', full_text, re.IGNORECASE)
    if delay_cnt_match:
        delay_count = int(delay_cnt_match.group(1))

    # Finansman Onay İhtimali (%)
    approval_chance = 50
    if score >= 1700:
        approval_chance = 95
    elif score >= 1500:
        approval_chance = 85
    elif score >= 1200:
        approval_chance = 70
    elif score >= 900:
        approval_chance = 40
    else:
        approval_chance = 15

    if delay_count > 0 or past_due_debt > 0:
        approval_chance = max(10, approval_chance - 25)

    # Gelir / Gider Oranı (DTI) - BDDK %50 kuralı
    income = monthly_income_tl or 60000.0
    estimated_monthly_installment = total_debt * 0.05
    dti_percent = round((estimated_monthly_installment / income) * 100, 1) if income > 0 else 0.0

    # Banka bazlı özel teklifler ve indirimli oran fırsatları
    bank_offers = [
        {
            "bankId": "kuveyt-turk",
            "bankName": "Kuveyt Türk",
            "approvalChance": approval_chance,
            "rateDiscountPercent": 0.30 if score >= 1500 else (0.15 if score >= 1200 else 0.0),
            "note": "İyi / Çok İyi risk grubuna özel kâr payı indirimi ve ön onaylı finansman seçeneği." if score >= 1500 else "Standart değerlendirme süreci."
        },
        {
            "bankId": "turkiye-finans",
            "bankName": "Türkiye Finans",
            "approvalChance": min(99, approval_chance + 5),
            "rateDiscountPercent": 0.25 if score >= 1400 else 0.0,
            "note": "Mobilden müşteri olanlara kâr paysız / indirimli finansman imkanı."
        },
        {
            "bankId": "albaraka",
            "bankName": "Albaraka Türk",
            "approvalChance": approval_chance,
            "rateDiscountPercent": 0.20 if score >= 1500 else 0.0,
            "note": "Masrafsız bankacılık avantajı ve esnek taksit yapılandırması."
        },
        {
            "bankId": "vakif-katilim",
            "bankName": "Vakıf Katılım",
            "approvalChance": approval_chance,
            "rateDiscountPercent": 0.15 if score >= 1500 else 0.0,
            "note": "Kamu katılım güvencesiyle konut ve ihtiyaç finansmanı desteği."
        },
        {
            "bankId": "ziraat-katilim",
            "bankName": "Ziraat Katılım",
            "approvalChance": approval_chance,
            "rateDiscountPercent": 0.15 if score >= 1500 else 0.0,
            "note": "Ziraat ekosistemi üzerinden hızlı değerlendirme."
        }
    ]

    return {
        "score": score,
        "riskGroup": risk_group,
        "totalLimitTl": total_limit if total_limit > 0 else 150000.0,
        "totalDebtTl": total_debt if total_debt > 0 else 35000.0,
        "pastDueDebtTl": past_due_debt,
        "delayCount": delay_count,
        "approvalChancePercent": approval_chance,
        "monthlyIncomeTl": income,
        "dtiPercent": dti_percent,
        "dtiStatus": "Uygun" if dti_percent <= 50 else "Riskli (BDDK %50 Limitini Aşıyor)",
        "bankOffers": bank_offers,
        "summaryMessage": f"Findeks Notunuz **{score} ({risk_group})**. Tahmini Finansman Onay İhtimaliniz **%{approval_chance}**."
    }
