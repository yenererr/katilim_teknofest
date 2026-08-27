from typing import Any, Dict, Optional

from app.findeks_core import analyze_findeks_pdf_bytes


def parse_findeks_pdf_bytes(
    pdf_bytes: bytes,
    monthly_income_tl: Optional[float] = None,
) -> Dict[str, Any]:
    return analyze_findeks_pdf_bytes(pdf_bytes, monthly_income_tl=monthly_income_tl)
