# -*- coding: utf-8 -*-
import pytest
from app.normalizer import number_to_turkish_words, clean_markdown_for_speech, normalize_turkish_financial_text

def test_number_to_turkish_words():
    assert number_to_turkish_words(0) == "sıfır"
    assert number_to_turkish_words(5) == "beş"
    assert number_to_turkish_words(10) == "on"
    assert number_to_turkish_words(24) == "yirmi dört"
    assert number_to_turkish_words(100) == "yüz"
    assert number_to_turkish_words(200) == "iki yüz"
    assert number_to_turkish_words(1000) == "bin"
    assert number_to_turkish_words(2000) == "iki bin"
    assert number_to_turkish_words(200000) == "iki yüz bin"
    assert number_to_turkish_words(1500000) == "bir milyon beş yüz bin"

def test_clean_markdown_for_speech():
    md = "# Başlık\n[Kuveyt Türk](https://kuveytturk.com.tr) **200 bin TL** finansman.\n- Madde 1"
    cleaned = clean_markdown_for_speech(md)
    assert "#" not in cleaned
    assert "https://" not in cleaned
    assert "[" not in cleaned
    assert "]" not in cleaned
    assert "**" not in cleaned
    assert "Kuveyt Türk" in cleaned

def test_normalize_turkish_financial_text():
    raw = "200.000 TL taşıt finansmanını %3,49 oran ve 24 ay vade ile karşılaştır. BSMV dahil."
    norm = normalize_turkish_financial_text(raw)
    assert "iki yüz bin Türk lirası" in norm
    assert "yüzde üç virgül kırk dokuz" in norm
    assert "yirmi dört ay" in norm
    assert "B S M V" in norm
