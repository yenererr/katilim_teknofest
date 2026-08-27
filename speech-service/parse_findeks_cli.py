import sys

from app.findeks_core import analyze_pdf_file, dumps_result


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("Kullanım: parse_findeks_cli.py <pdf_path_or_base64> [monthly_income]")

    target_path = sys.argv[1]
    income = float(sys.argv[2]) if len(sys.argv) > 2 else 60000.0
    print(dumps_result(analyze_pdf_file(target_path, income)))
