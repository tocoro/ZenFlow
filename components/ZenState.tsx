import React from 'react';

interface ZenStateProps {
  texts: {
    title: string;
    subtitle: string;
    hint: string;
  }
}

export const ZenState: React.FC<ZenStateProps> = ({ texts }) => {
  return (
    <div className="absolute inset-0 z-0 flex flex-col items-center justify-center pointer-events-none select-none">
      <div className="relative">
        <div className="absolute inset-0 bg-blue-500 rounded-full blur-[100px] opacity-20 animate-pulse-slow"></div>
        <h1 className="relative text-9xl font-bold text-white/5 tracking-tighter">{texts.title}</h1>
      </div>
      <p className="text-slate-500 font-mono mt-4 text-sm tracking-widest uppercase">
        {texts.subtitle}
      </p>
      <p className="text-slate-600 text-xs mt-2">
        {texts.hint}
      </p>
    </div>
  );
};