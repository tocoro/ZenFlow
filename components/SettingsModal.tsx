import React, { useRef, useState } from 'react';
import { Language, translations } from '../translations';

export interface CloudSettings {
  provider: 'custom' | 'supabase';
  // Custom Generic Settings
  url: string;
  apiKey: string;
  authHeader: string;
  method: 'POST' | 'PUT';
  jsonPath?: string; // New: Path to extract data (e.g. "record" for JSONBin)
  // Supabase Settings
  supabaseUrl: string;
  supabaseKey: string;
  tableName: string;
  slotId: string;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLang: Language;
  onLanguageChange: (lang: Language) => void;
  apiKeyStatus: boolean;
  onExport: () => void;
  onImport: (file: File) => void;
  cloudSettings: CloudSettings;
  onCloudSettingsChange: (settings: CloudSettings) => void;
}

export const SettingsModal = React.memo<SettingsModalProps>(({ 
  isOpen, 
  onClose, 
  currentLang, 
  onLanguageChange, 
  apiKeyStatus,
  onExport,
  onImport,
  cloudSettings,
  onCloudSettingsChange
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

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

  const handleCloudChange = (key: keyof CloudSettings, value: string) => {
    let newSettings = { ...cloudSettings, [key]: value };
    
    // Auto-configure for JSONBin if URL is pasted
    if (key === 'url' && value.includes('jsonbin.io')) {
       // If header is default or empty, switch to X-Master-Key as default assumption
       if (!newSettings.authHeader || newSettings.authHeader === 'Authorization') {
           newSettings.authHeader = 'X-Master-Key';
       }
       // If URL points to a specific bin (contains /b/<id>), default to PUT
       // Regex checks for /b/ followed by alphanumeric. EndsWith check prevents matching the base /b endpoint.
       if (/\/b\/[a-zA-Z0-9]+/.test(value) && !value.endsWith('/b')) {
           newSettings.method = 'PUT';
       }
    }

    onCloudSettingsChange(newSettings);
  };

  const handleJsonBinKeyType = (type: 'master' | 'access') => {
      const header = type === 'master' ? 'X-Master-Key' : 'X-Access-Key';
      onCloudSettingsChange({ ...cloudSettings, authHeader: header });
  };
  
  const handleProviderChange = (provider: 'custom' | 'supabase') => {
      onCloudSettingsChange({ ...cloudSettings, provider });
  }

  const tableName = cloudSettings.tableName || 'zenflow_data';
  const sqlCode = `create table ${tableName} (
  id text primary key,
  data jsonb
);
alter table ${tableName} enable row level security;
create policy "Public Access" on ${tableName} for all using (true) with check (true);`;

  const copySql = () => {
      navigator.clipboard.writeText(sqlCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };

  const isJsonBin = cloudSettings.url?.includes('jsonbin.io');

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity"
      onClick={onClose}
    >
      <div 
        className="bg-surface border border-white/10 p-8 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto relative transform transition-all"
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
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

        {/* Cloud Sync Settings */}
        <div className="mb-6 border-t border-b border-white/5 py-4">
             <div className="flex items-center justify-between mb-4">
                <label className="text-primary text-xs font-mono uppercase tracking-wider flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    {t.cloudSync}
                </label>
             </div>
             
             {/* Provider Toggle */}
             <div className="flex bg-black/20 rounded-lg p-1 mb-4 border border-white/5">
                 <button
                    onClick={() => handleProviderChange('custom')}
                    className={`flex-1 py-1.5 text-xs font-mono rounded-md transition-all ${cloudSettings.provider === 'custom' ? 'bg-surface text-white border border-white/10 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                 >
                     {t.providerCustom}
                 </button>
                 <button
                    onClick={() => handleProviderChange('supabase')}
                    className={`flex-1 py-1.5 text-xs font-mono rounded-md transition-all ${cloudSettings.provider === 'supabase' ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-500/30 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                 >
                     {t.providerSupabase}
                 </button>
             </div>

             {cloudSettings.provider === 'custom' ? (
                 <div className="space-y-3 animate-in fade-in slide-in-from-top-1">
                     <div>
                        <label className="block text-slate-500 text-[10px] uppercase mb-1">{t.endpointUrl}</label>
                        <input 
                            type="text" 
                            value={cloudSettings.url || ''} 
                            onChange={(e) => handleCloudChange('url', e.target.value)}
                            placeholder="https://api.jsonbin.io/v3/b/..."
                            className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-primary/50 font-mono"
                        />
                     </div>
                     
                     {/* JSONBin Helper Switch */}
                     {isJsonBin && (
                         <div className="flex items-center gap-2 bg-purple-900/20 p-2 rounded border border-purple-500/20">
                             <span className="text-[10px] text-purple-300 font-mono uppercase whitespace-nowrap">{t.keyType}:</span>
                             <div className="flex gap-1 flex-1">
                                 <button 
                                     onClick={() => handleJsonBinKeyType('master')}
                                     className={`flex-1 py-1 px-2 rounded text-[10px] transition-colors border ${cloudSettings.authHeader === 'X-Master-Key' ? 'bg-purple-500/30 text-white border-purple-500/50' : 'bg-black/20 text-slate-500 border-transparent hover:text-white'}`}
                                 >
                                     {t.keyTypeMaster}
                                 </button>
                                 <button 
                                     onClick={() => handleJsonBinKeyType('access')}
                                     className={`flex-1 py-1 px-2 rounded text-[10px] transition-colors border ${cloudSettings.authHeader === 'X-Access-Key' ? 'bg-purple-500/30 text-white border-purple-500/50' : 'bg-black/20 text-slate-500 border-transparent hover:text-white'}`}
                                 >
                                     {t.keyTypeAccess}
                                 </button>
                             </div>
                         </div>
                     )}

                     <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="block text-slate-500 text-[10px] uppercase mb-1">{t.authHeader}</label>
                            <input 
                                type="text" 
                                value={cloudSettings.authHeader || ''} 
                                onChange={(e) => handleCloudChange('authHeader', e.target.value)}
                                placeholder="X-Master-Key"
                                className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-primary/50 font-mono placeholder-slate-600"
                            />
                        </div>
                        <div>
                            <label className="block text-slate-500 text-[10px] uppercase mb-1">{t.apiKey}</label>
                            <input 
                                type="password" 
                                value={cloudSettings.apiKey || ''} 
                                onChange={(e) => handleCloudChange('apiKey', e.target.value)}
                                placeholder="Your Key"
                                className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-primary/50 font-mono"
                            />
                        </div>
                     </div>
                     <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="block text-slate-500 text-[10px] uppercase mb-1">{t.httpMethod}</label>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => handleCloudChange('method', 'POST')}
                                    className={`flex-1 py-1.5 rounded text-xs font-mono border ${cloudSettings.method === 'POST' ? 'bg-primary/20 text-primary border-primary' : 'bg-black/20 text-slate-500 border-white/10'}`}
                                >
                                    POST
                                </button>
                                <button 
                                    onClick={() => handleCloudChange('method', 'PUT')}
                                    className={`flex-1 py-1.5 rounded text-xs font-mono border ${cloudSettings.method === 'PUT' ? 'bg-primary/20 text-primary border-primary' : 'bg-black/20 text-slate-500 border-white/10'}`}
                                >
                                    PUT
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-slate-500 text-[10px] uppercase mb-1">{t.jsonPath}</label>
                            <input 
                                type="text" 
                                value={cloudSettings.jsonPath || ''} 
                                onChange={(e) => handleCloudChange('jsonPath', e.target.value)}
                                placeholder="record"
                                className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-primary/50 font-mono placeholder-slate-600"
                            />
                        </div>
                     </div>
                     {cloudSettings.jsonPath && <p className="text-[10px] text-primary/70">{t.jsonPathHint}</p>}
                     <p className="text-[10px] text-slate-500 italic leading-relaxed">{t.cloudHint}</p>
                 </div>
             ) : (
                 <div className="space-y-3 animate-in fade-in slide-in-from-top-1">
                     <div>
                        <label className="block text-slate-500 text-[10px] uppercase mb-1">{t.supabaseUrl}</label>
                        <input 
                            type="text" 
                            value={cloudSettings.supabaseUrl || ''} 
                            onChange={(e) => handleCloudChange('supabaseUrl', e.target.value)}
                            placeholder="https://xyz.supabase.co"
                            className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50 font-mono"
                        />
                     </div>
                     <div>
                        <label className="block text-slate-500 text-[10px] uppercase mb-1">{t.supabaseKey}</label>
                        <input 
                            type="password" 
                            value={cloudSettings.supabaseKey || ''} 
                            onChange={(e) => handleCloudChange('supabaseKey', e.target.value)}
                            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                            className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50 font-mono"
                        />
                     </div>
                     <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="block text-slate-500 text-[10px] uppercase mb-1">{t.tableName}</label>
                            <input 
                                type="text" 
                                value={cloudSettings.tableName || 'zenflow_data'} 
                                onChange={(e) => handleCloudChange('tableName', e.target.value)}
                                placeholder="zenflow_data"
                                className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50 font-mono"
                            />
                        </div>
                        <div>
                            <label className="block text-slate-500 text-[10px] uppercase mb-1">{t.slotId}</label>
                            <input 
                                type="text" 
                                value={cloudSettings.slotId || 'default'} 
                                onChange={(e) => handleCloudChange('slotId', e.target.value)}
                                placeholder="save-1"
                                className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50 font-mono"
                            />
                        </div>
                     </div>
                     
                     <div className="bg-black/30 rounded p-2 border border-white/5 mt-2">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] text-slate-400">{t.supabaseHint}</span>
                            <button 
                                onClick={copySql}
                                className="text-[9px] text-emerald-400 hover:text-emerald-300 font-mono uppercase border border-emerald-500/30 rounded px-1.5 py-0.5 hover:bg-emerald-500/10 transition-colors"
                            >
                                {copied ? t.copied : t.copySql}
                            </button>
                        </div>
                        <pre className="text-[9px] text-slate-500 font-mono overflow-x-auto whitespace-pre-wrap select-all">
                            {sqlCode}
                        </pre>
                     </div>
                 </div>
             )}
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
});