from evren_client import EvrenAPIError, EvrenClient


def main() -> None:
    try:
        client = EvrenClient()
        cevap = client.sohbet(
            kullanici_mesaji="Bir cümleyle kendini tanıt.",
            sistem_mesaji="Türkçe, açık ve kısa yanıt ver.",
            model="llm-fast",
            max_tokens=256,
        )

        print("Model yanıtı:")
        print(cevap)
        print()
        print(f"Kullanılan model aliası: {client.son_kullanilan_model or 'bilinmiyor'}")
        print("EVREN API bağlantısı başarılı.")
    except EvrenAPIError as hata:
        print(f"EVREN API bağlantı testi başarısız: {hata}")
    except Exception as hata:
        print(f"Beklenmeyen bir hata oluştu: {hata}")


if __name__ == "__main__":
    main()
