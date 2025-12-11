import React, { useRef } from 'react';
import { Language, translations } from '../translations';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLang: Language;
  onLanguageChange: (lang: Language) => void;
  apiKeyStatus: boolean;
  onExport: () => void;
  onImport: (file: File) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  currentLang, 
  onLanguageChange, 
  apiKeyStatus,
  onExport,
  onImport
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;
  
  const t = translations[currentLang];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImport(file);
    }
    // Reset value to allow same file selection again
    if (e.target) {
        e.target.value = '';
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity"
      onClick={onClose}
    >
      <div 
        className="bg-surface border border-white/10 p-8 rounded-2xl shadow-2xl w-full max-w-sm relative transform transition-all"
        onClick={e => e.stopPropagation()}
      >
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
          title={t.close}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-xl font-bold text-white mb-6 font-mono flex items-center gap-2">
            <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {t.settingsTitle}
        </h2>
        
        {/* Language Selector */}
        <div className="mb-6">
           <label className="block text-slate-400 text-xs font-mono uppercase tracking-wider mb-2">{t.languageLabel}</label>
           <div className="relative">
             <select 
               value={currentLang} 
               onChange={(e) => onLanguageChange(e.target.value as Language)}
               className="w-full appearance-none bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white font-mono focus:outline-none focus:border-primary/50 cursor-pointer hover:border-white/30 transition-colors"
             >
               <option value="ja" className="bg-surface">日本語 (Japanese)</option>
               <option value="en" className="bg-surface">English</option>
             </select>
             <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
             </div>
           </div>
        </div>

        {/* Data Management */}
        <div className="mb-8">
            <label className="block text-slate-400 text-xs font-mono uppercase tracking-wider mb-2">{t.dataManagement}</label>
            <div className="grid grid-cols-2 gap-2">
                <button
                    onClick={onExport}
                    className="flex items-center justify-center gap-2 bg-black/20 hover:bg-black/40 border border-white/10 hover:border-primary/50 rounded-lg py-3 px-4 text-sm text-white transition-all"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    {t.exportJson}
                </button>
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center justify-center gap-2 bg-black/20 hover:bg-black/40 border border-white/10 hover:border-accent/50 rounded-lg py-3 px-4 text-sm text-white transition-all"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    {t.importJson}
                </button>
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept=".json" 
                    className="hidden" 
                />
            </div>
            <p className="text-[10px] text-slate-500 mt-2">{t.importWarning}</p>
        </div>

        {/* Info Section */}
        <div className="border-t border-white/10 pt-6 space-y-2">
           <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-slate-500">MISSION</span>
                <span className="text-slate-300">{t.goal.replace("GOAL: ", "").replace("目標: ", "")}</span>
           </div>
           <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-slate-500">API STATUS</span>
                <span className={`flex items-center gap-1.5 ${apiKeyStatus ? "text-success" : "text-red-400"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${apiKeyStatus ? "bg-success" : "bg-red-400"}`}></span>
                    {apiKeyStatus ? t.connected : t.missing}
                </span>
           </div>
        </div>
      </div>
    </div>
  )
};
