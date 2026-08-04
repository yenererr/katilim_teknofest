import React from 'react';
import { SAMPLE_BANK_TEXTS } from '../data/samples';
import { SampleBankText } from '../types';
import { Landmark, ArrowRight } from 'lucide-react';

interface SamplePickerProps {
  onSelectSample: (sample: SampleBankText) => void;
  selectedId?: string;
}

export const SamplePicker: React.FC<SamplePickerProps> = ({ onSelectSample, selectedId }) => {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
          <Landmark className="w-4 h-4 text-emerald-600" />
          <span>Örnek Katılım Bankası Kampanyaları (Hızlı Seçim)</span>
        </div>
        <span className="text-[10px] font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 font-bold">
          6 RESMÎ ŞABLON
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {SAMPLE_BANK_TEXTS.map((sample) => {
          const isSelected = selectedId === sample.id;
          return (
            <button
              key={sample.id}
              onClick={() => onSelectSample(sample)}
              className={`p-3 rounded-lg text-left border text-xs transition-all flex flex-col justify-between group ${
                isSelected
                  ? 'bg-emerald-50/80 border-emerald-500/80 text-emerald-900 shadow-xs ring-2 ring-emerald-500/20'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white hover:border-slate-300 hover:shadow-xs'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-slate-800">{sample.bankName}</span>
                  <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase tracking-tight ${
                    sample.badge === 'Terim Eşlemeli'
                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                      : 'bg-slate-200/70 text-slate-600'
                  }`}>
                    {sample.badge}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 line-clamp-2 leading-tight">
                  {sample.title}
                </p>
              </div>
              <div className="mt-3 flex items-center justify-between text-[10px] font-bold text-slate-400 group-hover:text-emerald-600 transition-colors">
                <span>Yükle</span>
                <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

