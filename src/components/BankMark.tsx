import React from 'react';
import { BANKA_INDEKS } from '../data/piyasa';

interface BankMarkProps {
  bankaId?: string;
  /** Banka kimliği bilinmiyorsa ada göre monogram üretilir */
  ad?: string;
  size?: 'sm' | 'md';
}

const monogram = (ad: string) =>
  ad
    .split(/\s+/)
    .slice(0, 2)
    .map((k) => k[0])
    .join('')
    .toLocaleUpperCase('tr-TR');

/**
 * Banka markası. Bankanın resmî logosu `public/logos/` altında varsa onu,
 * yoksa marka renginde monogram rozetini gösterir.
 */
export const BankMark: React.FC<BankMarkProps> = ({ bankaId, ad, size = 'md' }) => {
  const banka = bankaId ? BANKA_INDEKS[bankaId] : undefined;
  const isim = banka?.ad ?? ad ?? 'Banka';
  const kisa = banka?.kisa ?? monogram(isim);
  const renk = banka?.renk ?? '#25477b';
  const boyut = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9';
  const yazi = size === 'sm' ? 'text-[0.625rem]' : 'text-xs';

  // Logo dosyası eksik veya bozuksa monograma düşülür.
  const [logoHatasi, setLogoHatasi] = React.useState(false);
  const logo = banka?.logo;

  React.useEffect(() => {
    setLogoHatasi(false);
  }, [logo]);

  if (logo && !logoHatasi) {
    return (
      <span
        className={`grid ${boyut} aspect-square shrink-0 self-center place-items-center overflow-hidden rounded-lg border border-line bg-white`}
      >
        <img
          src={logo}
          alt={`${isim} logosu`}
          loading="lazy"
          decoding="async"
          className="block h-full w-full object-contain p-0.5"
          onError={() => setLogoHatasi(true)}
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`grid ${boyut} ${yazi} shrink-0 place-items-center rounded-lg font-semibold tracking-tight text-white`}
      style={{ backgroundColor: renk }}
    >
      {kisa}
    </span>
  );
};
