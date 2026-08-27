# -*- coding: utf-8 -*-
import re

UNITS = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"]
TENS = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"]
THOUSANDS = ["", "bin", "milyon", "milyar", "trilyon"]

def number_to_turkish_words(n: int) -> str:
    """Converts an integer (up to 999,999,999,999) to Turkish words."""
    if n == 0:
        return "sıfır"
    if n < 0:
        return "eksi " + number_to_turkish_words(-n)

    words = []
    chunk_index = 0

    while n > 0:
        chunk = n % 1000
        if chunk > 0:
            chunk_words = _chunk_to_words(chunk)
            # Special case for "1000" in Turkish: "bin" instead of "bir bin"
            if chunk == 1 and chunk_index == 1:
                chunk_words = ""
            
            unit_name = THOUSANDS[chunk_index]
            part = f"{chunk_words} {unit_name}".strip() if unit_name else chunk_words
            words.insert(0, part)
        
        n //= 1000
        chunk_index += 1

    return " ".join(filter(None, words)).strip()

def _chunk_to_words(n: int) -> str:
    res = []
    hundreds = n // 100
    tens = (n % 100) // 10
    ones = n % 10

    if hundreds > 0:
        if hundreds == 1:
            res.append("yüz")
        else:
            res.append(f"{UNITS[hundreds]} yüz")
    
    if tens > 0:
        res.append(TENS[tens])
    
    if ones > 0:
        res.append(UNITS[ones])

    return " ".join(res)

def clean_markdown_for_speech(text: str) -> str:
    """Strips Markdown syntax, URLs, tabular separators, and non-speech symbols."""
    if not text:
        return ""

    # Remove Markdown Links [Label](url) -> Label
    text = re.sub(r'\[([^\]]+)\]\s*\([^)]+\)', r'\1', text)

    # Remove URLs
    text = re.sub(r'https?://\S+|www\.\S+', '', text)

    # Remove Markdown images
    text = re.sub(r'!\[[^\]]*\]\([^)]+\)', '', text)

    # Remove code blocks and inline code
    text = re.sub(r'```[\s\S]*?```', '', text)
    text = re.sub(r'`([^`]+)`', r'\1', text)

    # Remove Markdown headings
    text = re.sub(r'^#{1,6}\s*', '', text, flags=re.MULTILINE)

    # Remove Markdown table separators (|---|---|)
    text = re.sub(r'\|[:\s\-]+\|[:\s\-|]*', ' ', text)
    text = re.sub(r'\|', ' ', text)

    # Remove bullet markers
    text = re.sub(r'^\s*[*+\-]\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\s*\d+\.\s+', '', text, flags=re.MULTILINE)

    # Remove bold / italic markers
    text = re.sub(r'\*{1,3}([^*]+)\*{1,3}', r'\1', text)
    text = re.sub(r'_{1,3}([^_]+)_{1,3}', r'\1', text)

    # Remove common technical badges/labels
    text = re.sub(r'Güncellik:\s*\w+', '', text, flags=re.IGNORECASE)
    text = re.sub(r'Durum:\s*\w+', '', text, flags=re.IGNORECASE)
    text = re.sub(r'dataAsOf:\s*\S+', '', text, flags=re.IGNORECASE)
    text = re.sub(r'#\d+', '', text) # Citation IDs like #1 #2

    # Collapse multiple spaces and newlines
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def normalize_turkish_financial_text(text: str) -> str:
    """Normalizes Turkish numbers, percentages, currencies, and financial terms for speech synthesis."""
    text = clean_markdown_for_speech(text)
    if not text:
        return ""

    # Acronym spacing for clear pronunciation
    text = re.sub(r'\bBSMV\b', 'B S M V', text)
    text = re.sub(r'\bKKDF\b', 'K K D F', text)

    # Percentage normalization: %3,49 / % 3.49 -> yüzde üç virgül kırk dokuz
    def _replace_percentage(match):
        val_str = match.group(1).replace(',', '.')
        if '.' in val_str:
            whole, dec = val_str.split('.', 1)
            w_num = int(whole) if whole else 0
            d_num = int(dec) if dec else 0
            return f"yüzde {number_to_turkish_words(w_num)} virgül {number_to_turkish_words(d_num)}"
        else:
            n = int(val_str)
            return f"yüzde {number_to_turkish_words(n)}"

    text = re.sub(r'%\s*(\d+(?:[,.]\d+)?)', _replace_percentage, text)
    text = re.sub(r'yüzde\s*(\d+(?:[,.]\d+)?)', _replace_percentage, text, flags=re.IGNORECASE)

    # Currency normalization: 200.000 TL / 200000 TL / 200 bin TL / 200.000 ₺
    def _replace_currency(match):
        raw_num = match.group(1)
        if ',' in raw_num:
            parts = raw_num.split(',')
            whole_str = parts[0].replace('.', '')
            cents_str = parts[1]
            num_val = int(whole_str) if whole_str else 0
            cents_val = int(cents_str[:2]) if cents_str else 0
        else:
            whole_str = raw_num.replace('.', '')
            num_val = int(whole_str) if whole_str else 0
            cents_val = 0

        res = f"{number_to_turkish_words(num_val)} Türk lirası"
        if cents_val > 0:
            res += f" {number_to_turkish_words(cents_val)} kuruş"
        return res

    text = re.sub(r'\b(\d+(?:\.\d+)*(?:,\d+)?)\s*(?:TL|₺|Türk Lirası)\b', _replace_currency, text, flags=re.IGNORECASE)

    # Term/Month normalization: 24 ay -> yirmi dört ay
    def _replace_months(match):
        num = int(match.group(1))
        return f"{number_to_turkish_words(num)} ay"

    text = re.sub(r'\b(\d+)\s*ay\b', _replace_months, text, flags=re.IGNORECASE)

    # General standalone integer numbers to words
    def _replace_standalone_numbers(match):
        num_str = match.group(0)
        num = int(num_str)
        if 0 <= num <= 9999999:
            return number_to_turkish_words(num)
        return num_str

    text = re.sub(r'\b\d+\b', _replace_standalone_numbers, text)

    return text
