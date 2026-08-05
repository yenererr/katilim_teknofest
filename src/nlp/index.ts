/**
 * NLP katmanı — katmanlı hibrit bilgi çıkarımının dil işleme bileşenleri.
 *
 *  normalize : Türkçe metin normalizasyonu (yerel ayarlı küçültme, şapka/ASCII
 *              katlama, tırnak-boşluk sadeleştirme, sayı-para birimi çözümleme,
 *              yazıyla yazılmış sayılar)
 *  segment   : Türkçe cümle bölütleme (ondalık, tarih ve kısaltma korumalı)
 *              ve belirteçleme
 *  lexicon   : Sözlükbirim tabanlı terminoloji eşleme (çekim ekine toleranslı)
 *              ve olumsuzluk tespiti
 *  extract   : Kural tabanlı bilgi çıkarımı — birinci katman
 *  align     : Kanıt hizalama (birebir → normalize → cümle örtüşmesi)
 */

export * from './normalize';
export * from './segment';
export * from './lexicon';
export * from './align';
export * from './extract';
