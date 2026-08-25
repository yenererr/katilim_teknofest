import logging
import os
import time
from typing import Optional

from dotenv import load_dotenv
from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AuthenticationError,
    OpenAI,
    OpenAIError,
    RateLimitError,
)


logger = logging.getLogger(__name__)


class EvrenAPIError(RuntimeError):
    """Kullanıcıya güvenli biçimde gösterilebilecek EVREN API hatası."""


class EvrenClient:
    BASE_URL = "https://evren-llmapi.ssyz.org.tr/v1"
    DEFAULT_MODEL = "llm-fast"
    TIMEOUT_SECONDS = 1800
    MAX_RETRIES = 3

    def __init__(self, api_key: Optional[str] = None) -> None:
        load_dotenv()

        self.api_key = api_key or os.getenv("EVREN_API_KEY")
        if not self.api_key:
            raise EvrenAPIError(
                "EVREN_API_KEY bulunamadı. Lütfen .env dosyasına "
                "EVREN_API_KEY=... satırını ekleyin."
            )

        self.client = OpenAI(
            api_key=self.api_key,
            base_url=self.BASE_URL,
            timeout=self.TIMEOUT_SECONDS,
            max_retries=0,
        )
        self.son_kullanilan_model: Optional[str] = None

    def sohbet(
        self,
        kullanici_mesaji: str,
        sistem_mesaji: Optional[str] = None,
        model: str = DEFAULT_MODEL,
        max_tokens: int = 1024,
    ) -> str:
        if not kullanici_mesaji or not kullanici_mesaji.strip():
            raise EvrenAPIError("Kullanıcı mesajı boş olamaz.")

        messages = []
        if sistem_mesaji and sistem_mesaji.strip():
            messages.append({"role": "system", "content": sistem_mesaji.strip()})
        messages.append({"role": "user", "content": kullanici_mesaji.strip()})

        otomatik_tekrar = not self._uzun_video_istegi_mi(kullanici_mesaji)
        deneme_sayisi = self.MAX_RETRIES if otomatik_tekrar else 1
        son_hata: Optional[Exception] = None

        for deneme in range(1, deneme_sayisi + 1):
            try:
                response = self.client.chat.completions.create(
                    model=model,
                    messages=messages,
                    temperature=0.0,
                    max_tokens=max_tokens,
                )

                self.son_kullanilan_model = response.model
                if response.model and response.model != model:
                    logger.warning(
                        "İstenen model '%s' idi, API '%s' modelini çalıştırdı.",
                        model,
                        response.model,
                    )

                choice = response.choices[0] if response.choices else None
                content = choice.message.content if choice and choice.message else None
                if isinstance(content, str) and content.strip():
                    return content.strip()

                finish_reason = choice.finish_reason if choice else "bilinmiyor"
                raise EvrenAPIError(
                    "EVREN API boş yanıt döndürdü. "
                    f"finish_reason={finish_reason}"
                )

            except AuthenticationError as hata:
                raise EvrenAPIError(
                    "Kimlik doğrulama başarısız. EVREN_API_KEY değerini kontrol edin."
                ) from hata
            except APITimeoutError as hata:
                son_hata = hata
                if deneme < deneme_sayisi:
                    self._bekle(deneme)
                    continue
                raise EvrenAPIError(
                    "EVREN API isteği zaman aşımına uğradı. Ağ bağlantınızı ve servis durumunu kontrol edin."
                ) from hata
            except APIConnectionError as hata:
                son_hata = hata
                if deneme < deneme_sayisi:
                    self._bekle(deneme)
                    continue
                raise EvrenAPIError(
                    "EVREN API bağlantısı kurulamadı. İnternet bağlantınızı veya kurum ağınızı kontrol edin."
                ) from hata
            except RateLimitError as hata:
                son_hata = hata
                if deneme < deneme_sayisi:
                    self._bekle(deneme)
                    continue
                raise EvrenAPIError(
                    "EVREN API hız limitine takıldı. Bir süre bekleyip tekrar deneyin."
                ) from hata
            except APIStatusError as hata:
                if hata.status_code in {408, 429} or hata.status_code >= 500:
                    son_hata = hata
                    if deneme < deneme_sayisi:
                        self._bekle(deneme)
                        continue

                if hata.status_code in {401, 403}:
                    raise EvrenAPIError(
                        "EVREN API yetkilendirme hatası verdi. API anahtarınızı kontrol edin."
                    ) from hata
                if hata.status_code == 404:
                    raise EvrenAPIError(
                        "EVREN API adresi veya model yolu bulunamadı. base_url ve model adını kontrol edin."
                    ) from hata

                raise EvrenAPIError(
                    f"EVREN API hata döndürdü. HTTP durum kodu: {hata.status_code}"
                ) from hata
            except OpenAIError as hata:
                raise EvrenAPIError(
                    "EVREN API çağrısı OpenAI istemcisi tarafından işlenirken hata oluştu."
                ) from hata

        raise EvrenAPIError(f"EVREN API çağrısı başarısız oldu: {son_hata}")

    @staticmethod
    def _bekle(deneme: int) -> None:
        time.sleep(2 ** (deneme - 1))

    @staticmethod
    def _uzun_video_istegi_mi(metin: str) -> bool:
        kucuk = metin.lower()
        return "video" in kucuk and len(kucuk) > 1000
