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

/** Banka logosu yerine geçen, marka renginde monogram rozeti. */
export const BankMark: React.FC<BankMarkProps> = ({ bankaId, ad, size = 'md' }) => {
  const banka = bankaId ? BANKA_INDEKS[bankaId] : undefined;
  const isim = banka?.ad ?? ad ?? 'Banka';
  const kisa = banka?.kisa ?? monogram(isim);
  const renk = banka?.renk ?? '#068c5e';
  const boyut = size === 'sm' ? 'h-7 w-7 text-[0.625rem]' : 'h-9 w-9 text-xs';

  return (
    <span
      aria-hidden="true"
      className={`grid ${boyut} shrink-0 place-items-center rounded-lg font-semibold tracking-tight text-white`}
      style={{ backgroundColor: renk }}
    >
      {kisa}
    </span>
  );
};
