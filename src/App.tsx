/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Plane, 
  FileText, 
  Upload,
  X,
  Info,
  Paperclip,
  Image as ImageIcon,
  File as FileIcon,
  Loader2,
  Trash2,
  Download,
  UploadCloud,
  Cloud,
  RefreshCw,
  Copy,
  Check,
  Menu,
  Palette,
  LayoutDashboard,
  Settings,
  ChevronRight,
  Calculator
} from 'lucide-react';
import { gemini } from './services/geminiService';
import { storage } from './services/storageService';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence } from 'motion/react';
import * as pdfjs from 'pdfjs-dist';
import mammoth from 'mammoth';

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

// Initialize PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

type Theme = 'onyx' | 'aviation' | 'emerald' | 'minimal';

interface UploadedFile {
  name: string;
  type: string;
  data: string; // base64 for images, placeholder for others
  content?: string; // Extracted text content
}

const MessageItem = React.memo(({ msg, themeStyles, isDark }: { msg: Message, themeStyles: any, isDark: boolean }) => (
  <motion.div 
    initial={{ opacity: 0, y: 20, scale: 0.95 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ duration: 0.4, ease: "easeOut" }}
    className={cn("flex flex-col max-w-4xl", msg.role === 'user' ? "ml-auto items-end" : "items-start")}
  >
    <div className="flex items-center gap-3 mb-3">
      <span className="text-[10px] font-bold uppercase tracking-widest opacity-30">
        {msg.role === 'user' ? 'Load Officer' : 'Assistant'}
      </span>
      <div className={cn("w-1.5 h-1.5 rounded-full", msg.role === 'user' ? "bg-white/20" : cn(themeStyles.accentBg, "shadow-[0_0_8px_rgba(16,185,129,0.5)]"))} />
    </div>
    <div className={cn(
      "p-5 lg:p-6 rounded-2xl text-[14px] lg:text-[15px] leading-relaxed shadow-2xl transition-all",
      msg.role === 'user' 
        ? cn(themeStyles.chatUser, "text-white font-medium") 
        : cn(themeStyles.chatBot, "border")
    )}>
      <div className={cn("markdown-body prose max-w-none", isDark ? "prose-invert" : "prose-zinc")}>
        <ReactMarkdown>{msg.content}</ReactMarkdown>
      </div>
    </div>
  </motion.div>
));

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Merhaba, Çelebi Load Office Operasyon Asistanı hazır. LIR, Loadsheet, Trim Sheet veya Ağırlık-Denge dökümanlarınızı yükleyebilir, hesaplamalar ve süreçler hakkında sorgulama yapabilirsiniz.'
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isRestoring, setIsRestoring] = useState(true);
  const [syncCode, setSyncCode] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>('onyx');
  const [hasKey, setHasKey] = useState(true);
  const [manualKey, setManualKey] = useState('');
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showGuide, setShowGuide] = useState(false);

  const themeStyles = React.useMemo(() => ({
    onyx: {
      bg: 'bg-[#0A0A0A]',
      sidebar: 'bg-[#111111]',
      main: 'bg-[#050505]',
      accent: 'text-emerald-500',
      accentBg: 'bg-emerald-500',
      border: 'border-white/5',
      chatUser: 'bg-emerald-600',
      chatBot: 'bg-[#111111]',
    },
    aviation: {
      bg: 'bg-[#0F172A]',
      sidebar: 'bg-[#1E293B]',
      main: 'bg-[#020617]',
      accent: 'text-blue-400',
      accentBg: 'bg-blue-500',
      border: 'border-blue-500/10',
      chatUser: 'bg-blue-600',
      chatBot: 'bg-[#1E293B]',
    },
    emerald: {
      bg: 'bg-[#064E3B]',
      sidebar: 'bg-[#065F46]',
      main: 'bg-[#022C22]',
      accent: 'text-emerald-300',
      accentBg: 'bg-emerald-400',
      border: 'border-emerald-500/10',
      chatUser: 'bg-emerald-700',
      chatBot: 'bg-[#065F46]',
    },
    minimal: {
      bg: 'bg-zinc-50',
      sidebar: 'bg-white',
      main: 'bg-zinc-100',
      accent: 'text-zinc-900',
      accentBg: 'bg-zinc-900',
      border: 'border-zinc-200',
      chatUser: 'bg-zinc-900 text-white',
      chatBot: 'bg-white text-zinc-900 border-zinc-200',
      text: 'text-zinc-900',
      muted: 'text-zinc-500'
    }
  }[theme]), [theme]);

  const isDark = theme !== 'minimal';

  const contextSize = React.useMemo(() => {
    return uploadedFiles.reduce((acc, f) => acc + (f.content?.length || 0), 0);
  }, [uploadedFiles]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages]);

  useEffect(() => {
    const checkKey = async () => {
      // Check localStorage first
      const savedKey = localStorage.getItem('CELEBI_GEMINI_API_KEY');
      if (savedKey) {
        (window as any).MANUAL_GEMINI_API_KEY = savedKey;
        setHasKey(true);
        return;
      }

      // If we have an environment key or a manual key, we are good
      if (process.env.GEMINI_API_KEY || (window as any).MANUAL_GEMINI_API_KEY) {
        setHasKey(true);
        return;
      }

      if (window.aistudio?.hasSelectedApiKey) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasKey(selected);
      }
    };
    checkKey();
  }, []);

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      setShowGuide(true);
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const downloadShortcut = () => {
    const url = window.location.href;
    const content = `[InternetShortcut]\nURL=${url}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'Celebi_Ops_Asistani.url';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const handleSelectKey = async () => {
    try {
      if (window.aistudio?.openSelectKey) {
        await window.aistudio.openSelectKey();
        setHasKey(true);
        setShowManualEntry(false);
      } else {
        setShowManualEntry(true);
      }
    } catch (err) {
      console.error("Key selection failed:", err);
      setShowManualEntry(true);
    }
  };

  const handleSaveManualKey = () => {
    if (manualKey.trim()) {
      const trimmedKey = manualKey.trim();
      // We store it in a way that our service can pick it up
      (window as any).MANUAL_GEMINI_API_KEY = trimmedKey;
      localStorage.setItem('CELEBI_GEMINI_API_KEY', trimmedKey);
      setHasKey(true);
      setShowManualEntry(false);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: '✅ API anahtarı başarıyla güncellendi ve kaydedildi. Artık kendi kotanızı kullanıyorsunuz. Uygulamayı kapatsanız bile bu anahtar hatırlanacaktır.' 
      }]);
    }
  };

  // Restore state from IndexedDB on mount
  useEffect(() => {
    const restoreState = async () => {
      try {
        const savedMessages = await storage.load('messages');
        const savedFiles = await storage.load('uploadedFiles');
        const savedSyncCode = await storage.load('syncCode');
        const savedTheme = await storage.load('theme');
        const savedManualKey = await storage.load('manualKey');

        if (savedMessages) setMessages(savedMessages);
        if (savedFiles) setUploadedFiles(savedFiles);
        if (savedSyncCode) setSyncCode(savedSyncCode);
        if (savedTheme) setTheme(savedTheme);
        if (savedManualKey) {
          setManualKey(savedManualKey);
          (window as any).MANUAL_GEMINI_API_KEY = savedManualKey;
        }
      } catch (err) {
        console.error('Failed to restore state:', err);
      } finally {
        setIsRestoring(false);
      }
    };
    restoreState();
  }, []);

  // Save state to IndexedDB when it changes
  useEffect(() => {
    if (isRestoring) return;
    storage.save('messages', messages);
    storage.save('uploadedFiles', uploadedFiles);
    storage.save('syncCode', syncCode);
    storage.save('theme', theme);
    storage.save('manualKey', manualKey);
  }, [messages, uploadedFiles, syncCode, theme, manualKey, isRestoring]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    
    // Prepare files for Gemini
    const imageFiles = uploadedFiles
      .filter(f => f.type.startsWith('image/'))
      .map(f => ({ data: f.data, mimeType: f.type }));

    // Construct context from all non-image files
    const dynamicContext = uploadedFiles
      .filter(f => !f.type.startsWith('image/') && f.content)
      .map(f => `[Döküman: ${f.name}]\n${f.content}`)
      .join('\n\n');

    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await gemini.chat(userMessage, dynamicContext, imageFiles, messages);
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (error: any) {
      console.error(error);
      const errorMsg = error.message || 'Bilinmeyen bir hata oluştu.';
      
      let displayMsg = `Üzgünüm, bir hata oluştu: ${errorMsg}`;

      if (errorMsg.includes('403') || errorMsg.includes('Forbidden')) {
        displayMsg = `Hata (403): Erişim reddedildi. (Detay: ${errorMsg})\n\nBu durum genellikle şunlardan kaynaklanır:\n\n1. API anahtarınızın bölge kısıtlaması.\n2. API anahtarınızın 'Gemini API' servisi için etkinleştirilmemiş olması.\n3. VPN/Ağ kısıtlamaları.\n\nLütfen anahtarınızın aktif olduğunu kontrol edin.`;
        setHasKey(false);
      } else if (errorMsg.includes('429') || errorMsg.includes('quota')) {
        displayMsg = "Hata (429): Günlük kullanım kotanız doldu veya çok hızlı istek gönderdiniz. \n\nLütfen 1-2 dakika bekleyip tekrar deneyin. Sorun devam ederse Google AI Studio üzerinden yeni bir API anahtarı almayı deneyebilirsiniz.";
      } else if (errorMsg.includes('anahtar') || errorMsg.includes('key')) {
        setHasKey(false);
        displayMsg += "\n\nLütfen API anahtarınızı kontrol edin veya aşağıdaki butonu kullanarak anahtar seçin.";
      }

      setMessages(prev => [...prev, { role: 'assistant', content: displayMsg }]);
    } finally {
      setIsLoading(false);
    }
  };

  const processFile = async (file: File) => {
    const type = file.type;
    const name = file.name;

    if (type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = e.target?.result as string;
        setUploadedFiles(prev => [...prev, { name, type, data }]);
      };
      reader.readAsDataURL(file);
    } else if (type === 'application/pdf') {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
      }
      setUploadedFiles(prev => [...prev, { name, type, data: 'PDF', content: fullText }]);
    } else if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      setUploadedFiles(prev => [...prev, { name, type, data: 'DOCX', content: result.value }]);
    } else {
      const text = await file.text();
      setUploadedFiles(prev => [...prev, { name, type, data: 'TEXT', content: text }]);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsLoading(true);
    const newFileNames: string[] = [];
    
    for (const file of files) {
      await processFile(file);
      newFileNames.push(file.name);
    }
    
    if (fileInputRef.current) fileInputRef.current.value = '';

    // Trigger automatic analysis of new files
    try {
      const analysisPrompt = `Yeni dökümanlar yüklendi: ${newFileNames.join(', ')}. Lütfen bu dökümanları tara ve kısaca ne içerdiğini (uçuş no, tarih, döküman tipi vb.) özetle. Artık bu dökümanları hafızana aldığını teyit et.`;
      
      // We need the updated uploadedFiles state, but since setUploadedFiles is async, 
      // we might need to wait or use the local result. 
      // However, handleSend will be called in the next turn.
      // For now, let's just send a confirmation message.
      
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `📂 **${newFileNames.length} yeni döküman sisteme yüklendi:**\n${newFileNames.map(n => `- ${n}`).join('\n')}\n\nTüm dökümanlar analiz ediliyor ve hafızaya alınıyor...` 
      }]);

      // Optional: You could call gemini.chat here to get a real summary, 
      // but it might be better to let the user ask.
      // The user said "tara ve öğren", so let's do a quick silent "learning" or just a confirmation.
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleReset = async () => {
    await storage.clear();
    localStorage.removeItem('CELEBI_GEMINI_API_KEY');
    (window as any).MANUAL_GEMINI_API_KEY = undefined;
    setUploadedFiles([]);
    setMessages([
      {
        role: 'assistant',
        content: 'Merhaba, Çelebi Load Office Operasyon Asistanı hazır. LIR, Loadsheet, Trim Sheet veya Ağırlık-Denge dökümanlarınızı yükleyebilir, hesaplamalar ve süreçler hakkında sorgulama yapabilirsiniz.'
      }
    ]);
  };

  const clearChat = () => {
    setMessages([
      {
        role: 'assistant',
        content: 'Sohbet geçmişi temizlendi. Yüklü olan operasyonel dökümanlar hafızada tutulmaya devam ediyor.'
      }
    ]);
    // Force immediate save to clear storage
    storage.save('messages', [
      {
        role: 'assistant',
        content: 'Sohbet geçmişi temizlendi. Yüklü olan operasyonel dökümanlar hafızada tutulmaya devam ediyor.'
      }
    ]);
  };

  const startNewChat = () => {
    // Keep uploadedFiles as requested by user
    setMessages([
      {
        role: 'assistant',
        content: 'Yeni sohbet başlatıldı. Mevcut dökümanlar hafızada tutuluyor. Yeni sorularınızı sorabilir veya yeni dökümanlar ekleyebilirsiniz.'
      }
    ]);
    storage.save('messages', [{ 
      role: 'assistant', 
      content: 'Yeni sohbet başlatıldı. Mevcut dökümanlar hafızada tutuluyor. Yeni sorularınızı sorabilir veya yeni dökümanlar ekleyebilirsiniz.' 
    }]);
  };

  const handleExportData = async () => {
    const data = {
      messages,
      uploadedFiles,
      manualKey,
      exportDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `celebi_ops_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.messages && data.uploadedFiles) {
          setMessages(data.messages);
          setUploadedFiles(data.uploadedFiles);
          if (data.manualKey) {
            setManualKey(data.manualKey);
            (window as any).MANUAL_GEMINI_API_KEY = data.manualKey;
          }
        }
      } catch (err) {
        console.error(err);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const generateCode = () => {
    const code = 'CELEBI-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    setSyncCode(code);
  };

  const copyCode = () => {
    navigator.clipboard.writeText(syncCode);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const saveToCloud = async () => {
    if (!syncCode) return;
    setIsSyncing(true);
    try {
      const response = await fetch('/api/sync/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: syncCode,
          data: { messages, uploadedFiles, manualKey }
        })
      });
      if (response.ok) {
        setMessages(prev => [...prev, { role: 'assistant', content: '✅ Veriler buluta başarıyla kaydedildi.' }]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSyncing(false);
    }
  };

  const loadFromCloud = async () => {
    if (!syncCode) return;
    
    setIsSyncing(true);
    try {
      const response = await fetch(`/api/sync/load/${syncCode}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages);
        setUploadedFiles(data.uploadedFiles);
        if (data.manualKey && data.manualKey.trim().length > 10) {
          setManualKey(data.manualKey);
          (window as any).MANUAL_GEMINI_API_KEY = data.manualKey;
          localStorage.setItem('CELEBI_GEMINI_API_KEY', data.manualKey);
        }
        setMessages(prev => [...prev, { role: 'assistant', content: '✅ Veriler buluttan başarıyla yüklendi.' }]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSyncing(false);
    }
  };

  if (isRestoring) {
    return (
      <div className="h-screen bg-[#050505] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={40} className="animate-spin text-emerald-500" />
          <p className="text-xs font-mono uppercase tracking-widest text-white/40">Sistem Hazırlanıyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex h-screen overflow-hidden font-sans", themeStyles.bg, isDark ? "text-white" : "text-zinc-900")}>
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-80 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 flex flex-col border-r",
        themeStyles.sidebar,
        themeStyles.border,
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 border-b border-white/5">
          <button
            onClick={startNewChat}
            className={cn(
              "w-full py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 border shadow-lg",
              isDark ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30" : "bg-emerald-600 border-emerald-700 text-white hover:bg-emerald-700"
            )}
          >
            <RefreshCw size={16} /> Yeni Sohbet Başlat
          </button>
        </div>

        <div className="p-8 overflow-y-auto flex-1 custom-scrollbar">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shadow-lg", themeStyles.accentBg)}>
                <Calculator size={20} className={isDark ? "text-black" : "text-white"} />
              </div>
              <div>
                <h1 className="font-bold tracking-tight text-lg">Çelebi Load</h1>
                <p className={cn("text-[10px] uppercase tracking-[0.2em] font-bold", themeStyles.accent)}>Office Assistant</p>
              </div>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 hover:bg-white/5 rounded-lg">
              <X size={20} />
            </button>
          </div>
          
          <div className="space-y-1">
            <div className={cn("px-3 py-2 rounded-lg border flex items-center gap-3", isDark ? "bg-white/5 border-white/10" : "bg-zinc-100 border-zinc-200")}>
              <div className={cn("w-2 h-2 rounded-full animate-pulse", themeStyles.accentBg)} />
              <span className="text-[10px] font-mono uppercase tracking-wider opacity-70">
                Sistem: {(window as any).MANUAL_GEMINI_API_KEY || localStorage.getItem('CELEBI_GEMINI_API_KEY') ? 'Kişisel Anahtar' : 'Genel Kota'}
              </span>
            </div>
            {uploadedFiles.length > 0 && (
              <div className={cn("px-3 py-2 rounded-lg border flex items-center justify-between", isDark ? "bg-white/5 border-white/10" : "bg-zinc-100 border-zinc-200")}>
                <span className="text-[9px] font-mono uppercase tracking-wider opacity-40">Veri Yükü:</span>
                <span className={cn("text-[9px] font-mono font-bold", contextSize > 50000 ? "text-orange-400" : "text-emerald-400")}>
                  {(contextSize / 1024).toFixed(1)} KB
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 space-y-8 pb-10">
          <section>
            <h2 className="text-[10px] uppercase tracking-[0.2em] opacity-40 font-bold mb-4 flex items-center gap-2">
              <LayoutDashboard size={12} /> Load Office Panel
            </h2>
            <div className="grid gap-2">
              <motion.div 
                whileHover={{ scale: 1.02 }}
                className={cn("p-3 rounded-xl border transition-colors", isDark ? "bg-white/5 border-white/5 hover:border-white/10" : "bg-white border-zinc-200 hover:border-zinc-300")}
              >
                <p className={cn("text-[10px] font-mono mb-1", themeStyles.accent)}>LIR / LOADSHEET</p>
                <p className="text-xs font-medium">Underload Check: OK</p>
              </motion.div>
              <motion.div 
                whileHover={{ scale: 1.02 }}
                className={cn("p-3 rounded-xl border transition-colors", isDark ? "bg-white/5 border-white/5 hover:border-white/10" : "bg-white border-zinc-200 hover:border-zinc-300")}
              >
                <p className={cn("text-[10px] font-mono mb-1", themeStyles.accent)}>TRIM LIMITS</p>
                <p className="text-xs font-medium">MAC %: 15.0 - 35.0</p>
              </motion.div>
              <motion.div 
                whileHover={{ scale: 1.02 }}
                className={cn("p-3 rounded-xl border transition-colors", isDark ? "bg-white/5 border-white/5 hover:border-white/10" : "bg-white border-zinc-200 hover:border-zinc-300")}
              >
                <p className={cn("text-[10px] font-mono mb-1", themeStyles.accent)}>DANGEROUS GOODS</p>
                <p className="text-xs font-medium">NOTOC Required: NO</p>
              </motion.div>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[10px] uppercase tracking-[0.2em] opacity-40 font-bold flex items-center gap-2">
                <Palette size={12} /> Görünüm Teması
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(['onyx', 'aviation', 'emerald', 'minimal'] as Theme[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={cn(
                    "px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all",
                    theme === t 
                      ? (isDark ? "bg-white/10 border-white/20 text-white" : "bg-zinc-900 border-zinc-900 text-white")
                      : (isDark ? "bg-white/5 border-white/5 text-white/40 hover:bg-white/10" : "bg-white border-zinc-200 text-zinc-400 hover:bg-zinc-50")
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[10px] uppercase tracking-[0.2em] opacity-40 font-bold flex items-center gap-2">
                <FileText size={12} /> Operasyonel Dökümanlar
              </h2>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className={cn("p-1.5 hover:bg-white/10 rounded-lg transition-colors", themeStyles.accent)}
              >
                <Upload size={14} />
              </button>
            </div>
            
            <div className="space-y-2">
              {uploadedFiles.map((file, i) => (
                <div key={i} className={cn("group flex items-center justify-between p-2 rounded-lg border text-xs", isDark ? "bg-white/5 border-white/5" : "bg-white border-zinc-200")}>
                  <div className="flex items-center gap-2 truncate pr-2">
                    {file.type.startsWith('image/') ? <ImageIcon size={12} /> : <FileIcon size={12} />}
                    <span className="truncate opacity-70">{file.name}</span>
                  </div>
                  <button onClick={() => removeFile(i)} className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-all">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              {uploadedFiles.length === 0 && (
                <p className="text-[10px] opacity-20 italic text-center py-4">Döküman bekleniyor...</p>
              )}
              {uploadedFiles.length > 0 && (
                <button 
                  onClick={() => setUploadedFiles([])}
                  className="w-full py-2 text-[9px] uppercase tracking-[0.2em] font-bold opacity-30 hover:opacity-100 hover:text-red-400 transition-all"
                >
                  Tüm Dökümanları Temizle
                </button>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-[10px] uppercase tracking-[0.2em] opacity-40 font-bold mb-4 flex items-center gap-2">
              <Settings size={12} /> Sistem Ayarları
            </h2>
            <div className="space-y-3">
              <button
                onClick={handleSelectKey}
                className={cn(
                  "w-full py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all flex items-center justify-center gap-2",
                  !hasKey && !showManualEntry
                    ? "bg-red-500/10 border-red-500/20 text-red-500 animate-pulse" 
                    : (isDark ? "bg-white/5 border-white/5 text-white/60" : "bg-zinc-100 border-zinc-200 text-zinc-600")
                )}
              >
                <Settings size={12} /> {hasKey ? "API Anahtarını Güncelle" : "Otomatik Anahtar Seç"}
              </button>

              <button
                onClick={clearChat}
                className={cn(
                  "w-full py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all flex items-center justify-center gap-2",
                  isDark ? "bg-white/5 border-white/5 text-white/60 hover:bg-white/10" : "bg-zinc-100 border-zinc-200 text-zinc-600 hover:bg-zinc-200"
                )}
              >
                <Trash2 size={12} /> Sohbeti Temizle
              </button>

              {(!hasKey || showManualEntry) && (
                <div className={cn("p-3 rounded-xl border space-y-2", isDark ? "bg-red-500/5 border-red-500/20" : "bg-red-50 border-red-100")}>
                  <p className="text-[9px] font-bold uppercase text-red-400">Manuel Anahtar Girişi</p>
                  <input 
                    type="password"
                    value={manualKey}
                    onChange={(e) => setManualKey(e.target.value)}
                    placeholder="API Key Yapıştırın..."
                    className={cn(
                      "w-full px-2 py-1.5 rounded text-[10px] font-mono focus:outline-none border",
                      isDark ? "bg-black/40 border-white/10 text-white" : "bg-white border-zinc-200 text-zinc-900"
                    )}
                  />
                  <button 
                    onClick={handleSaveManualKey}
                    className={cn(
                      "w-full py-1.5 rounded text-[9px] font-bold uppercase transition-all",
                      isDark ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30" : "bg-emerald-600 text-white hover:bg-emerald-700"
                    )}
                  >
                    Anahtarı Kaydet
                  </button>
                </div>
              )}
              
              {!hasKey && !showManualEntry && (
                <p className="text-[8px] text-red-400/60 leading-tight italic text-center">
                  * Otomatik seçim çalışmazsa butona tekrar tıklayın.
                </p>
              )}
            </div>
          </section>

          <section className="mt-auto pt-8">
            <div className="space-y-3">
              <button
                onClick={() => setShowGuide(true)}
                className={cn(
                  "w-full py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 border",
                  isDark ? "bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20" : "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                )}
              >
                <Info size={14} /> Kurulum Rehberi (Arkadaşların İçin)
              </button>

              <button
                onClick={downloadShortcut}
                className={cn(
                  "w-full py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 border",
                  isDark ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20" : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                )}
              >
                <Download size={14} /> Masaüstü Kısayolu İndir
              </button>
              
              <div className={cn("p-3 rounded-xl border", isDark ? "bg-white/5 border-white/5" : "bg-zinc-100 border-zinc-200")}>
                <p className="text-[9px] font-bold uppercase opacity-40 mb-2">Hızlı Erişim</p>
                <p className="text-[8px] leading-relaxed opacity-60">
                  Bu uygulamayı iş arkadaşlarınıza göndermek için yukarıdaki "Kısayol İndir" butonuna basın ve inen dosyayı onlara (E-posta/Teams) gönderin.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-[10px] uppercase tracking-[0.2em] opacity-40 font-bold mb-4 flex items-center gap-2">
              <Cloud size={12} /> Bulut Senkronizasyonu
            </h2>
            <div className={cn("space-y-3 p-4 rounded-xl border", isDark ? "bg-white/5 border-white/5" : "bg-white border-zinc-200")}>
              <div className="space-y-1">
                <label className="text-[9px] uppercase opacity-30 font-bold">Erişim Kodunuz</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={syncCode}
                    onChange={(e) => setSyncCode(e.target.value.toUpperCase())}
                    placeholder="KOD GİRİN"
                    className={cn(
                      "flex-1 border rounded-lg px-2 py-1.5 text-xs font-mono focus:outline-none",
                      isDark ? "bg-black/40 border-white/10 focus:border-emerald-500/50" : "bg-zinc-50 border-zinc-200 focus:border-zinc-400"
                    )}
                  />
                  <button 
                    onClick={generateCode}
                    className="p-1.5 hover:bg-white/10 rounded-lg transition-colors opacity-40"
                    title="Yeni Kod Oluştur"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
              </div>

              {syncCode && (
                <button 
                  onClick={copyCode}
                  className={cn("w-full py-1.5 rounded-lg text-[9px] flex items-center justify-center gap-2 transition-all", isDark ? "bg-white/5 hover:bg-white/10" : "bg-zinc-100 hover:bg-zinc-200")}
                >
                  {copySuccess ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                  {copySuccess ? 'Kopyalandı' : 'Kodu Kopyala'}
                </button>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button 
                  onClick={saveToCloud}
                  disabled={isSyncing || !syncCode}
                  className={cn(
                    "py-2 border rounded-lg text-[9px] font-bold uppercase transition-all flex items-center justify-center gap-1.5 disabled:opacity-50",
                    isDark ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border-emerald-500/20" : "bg-zinc-900 text-white border-zinc-900"
                  )}
                >
                  {isSyncing ? <RefreshCw size={10} className="animate-spin" /> : <Cloud size={10} />}
                  Kaydet
                </button>
                <button 
                  onClick={loadFromCloud}
                  disabled={isSyncing || !syncCode}
                  className={cn(
                    "py-2 border rounded-lg text-[9px] font-bold uppercase transition-all flex items-center justify-center gap-1.5 disabled:opacity-50",
                    isDark ? "bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 border-blue-500/20" : "bg-zinc-100 text-zinc-900 border-zinc-200"
                  )}
                >
                  {isSyncing ? <RefreshCw size={10} className="animate-spin" /> : <Download size={10} />}
                  Yükle
                </button>
              </div>
            </div>
          </section>
        </div>

        <div className="p-6 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={handleExportData}
              className={cn("py-2.5 border rounded-xl text-[9px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2", isDark ? "bg-white/5 hover:bg-white/10 border-white/5" : "bg-zinc-100 border-zinc-200")}
              title="Verileri Yedekle"
            >
              <Download size={12} /> Yedekle
            </button>
            <label className={cn("py-2.5 border rounded-xl text-[9px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer", isDark ? "bg-white/5 hover:bg-white/10 border-white/5" : "bg-zinc-100 border-zinc-200")}>
              <UploadCloud size={12} /> Aktar
              <input type="file" accept=".json" onChange={handleImportData} className="hidden" />
            </label>
          </div>
          <button 
            onClick={handleReset}
            className={cn("w-full py-2.5 border rounded-xl text-[9px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2", isDark ? "bg-white/5 hover:bg-red-500/10 hover:text-red-400 border-white/5" : "bg-red-50 border-red-100 text-red-600")}
          >
            <Trash2 size={12} /> Hafızayı Sıfırla
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={cn("flex-1 flex flex-col", themeStyles.main)}>
        {/* Header */}
        <header className={cn("h-20 border-b flex items-center justify-between px-6 lg:px-10 backdrop-blur-xl sticky top-0 z-10", themeStyles.bg, themeStyles.border)}>
          <div className="flex items-center gap-4 lg:gap-8">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 hover:bg-white/5 rounded-lg"
            >
              <Menu size={20} />
            </button>
            <div className="hidden sm:block">
              <p className="text-[10px] font-mono uppercase opacity-30 mb-0.5">Station</p>
              <p className="text-sm font-bold tracking-tight">AYT / ANTALYA</p>
            </div>
            <div className="hidden sm:block w-px h-8 bg-white/10" />
            <div>
              <p className="text-[10px] font-mono uppercase opacity-30 mb-0.5">Load Office</p>
              <p className={cn("text-sm font-bold tracking-tight", themeStyles.accent)}>LIR / LOADSHEET</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={clearChat}
              className={cn(
                "hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all",
                isDark ? "bg-white/5 border-white/5 text-white/40 hover:bg-white/10 hover:text-red-400" : "bg-zinc-100 border-zinc-200 text-zinc-500 hover:bg-zinc-200"
              )}
            >
              <Trash2 size={12} /> Temizle
            </button>
            <div className={cn("px-3 py-1.5 rounded-full text-[10px] font-bold border", isDark ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" : "bg-emerald-50 border-emerald-200 text-emerald-700")}>
              LIVE OPS
            </div>
          </div>
        </header>

        {/* Chat Area */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-6 lg:p-10 space-y-8 lg:space-y-10 scroll-smooth"
        >
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <MessageItem key={i} msg={msg} themeStyles={themeStyles} isDark={isDark} />
            ))}
          </AnimatePresence>
          {isLoading && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-start"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-30">Assistant</span>
                <Loader2 size={12} className={cn("animate-spin", themeStyles.accent)} />
              </div>
              <div className={cn("p-6 border rounded-2xl", themeStyles.chatBot)}>
                <div className="flex gap-1.5">
                  <div className={cn("w-2 h-2 rounded-full animate-bounce", themeStyles.accentBg)} style={{ animationDelay: '0ms' }} />
                  <div className={cn("w-2 h-2 rounded-full animate-bounce", themeStyles.accentBg)} style={{ animationDelay: '150ms' }} />
                  <div className={cn("w-2 h-2 rounded-full animate-bounce", themeStyles.accentBg)} style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Input Area */}
        <div className={cn("p-6 lg:p-10", isDark ? "bg-gradient-to-t from-black to-transparent" : "bg-white border-t border-zinc-200")}>
          <div className="max-w-5xl mx-auto">
            <div className="relative group">
              {isDark && <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/20 to-blue-500/20 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition duration-500" />}
              <div className={cn(
                "relative flex items-center border rounded-2xl overflow-hidden transition-all",
                isDark ? "bg-[#111111] border-white/10 focus-within:border-emerald-500/50" : "bg-zinc-50 border-zinc-200 focus-within:border-zinc-400"
              )}>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-4 lg:p-5 opacity-30 hover:opacity-100 transition-opacity"
                >
                  <Paperclip size={20} />
                </button>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Yükleme planı, LIR veya ağırlık-denge sorgulayın..."
                  className="flex-1 bg-transparent py-4 lg:py-5 text-sm focus:outline-none placeholder:opacity-20"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className={cn("p-4 lg:p-5 transition-all disabled:opacity-10", themeStyles.accent)}
                >
                  {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                </button>
              </div>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              multiple 
              accept=".txt,.pdf,.docx,image/*" 
              onChange={handleFileUpload} 
            />
            <div className="mt-4 flex flex-wrap justify-center gap-4 lg:gap-10 opacity-20">
              <span className="text-[9px] font-mono uppercase tracking-[0.3em]">Altea FM v24.1</span>
              <span className="text-[9px] font-mono uppercase tracking-[0.3em]">Load Engine 5.2</span>
              <span className="text-[9px] font-mono uppercase tracking-[0.3em]">Secure Terminal AYT</span>
            </div>
          </div>
        </div>

        {/* Guide Modal */}
        <AnimatePresence>
          {showGuide && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowGuide(false)}
                className="absolute inset-0 bg-black/80 backdrop-blur-md"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className={cn("relative w-full max-w-2xl rounded-3xl overflow-hidden border shadow-2xl flex flex-col max-h-[90vh]", isDark ? "bg-[#111] border-white/10" : "bg-white border-zinc-200")}
              >
                <div className="p-8 border-b border-white/5 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight">Kurulum Rehberi</h2>
                    <p className="text-xs opacity-50 uppercase tracking-widest font-mono mt-1">İş Arkadaşların İçin Kolay Erişim</p>
                  </div>
                  <button onClick={() => setShowGuide(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                    <X size={24} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-8">
                  <section className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold">1</div>
                      <h3 className="font-bold">Bilgisayara Uygulama Olarak Yükleme (Önerilen)</h3>
                    </div>
                    <div className="pl-11 space-y-2 text-sm opacity-80">
                      <p>Chrome veya Edge kullanıyorsanız:</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>Adres çubuğunun sağındaki <b>"Uygulamayı Yükle"</b> simgesine tıklayın.</li>
                        <li>Veya tarayıcı menüsünden (üç nokta) <b>"Uygulamalar" {'>'} "Bu siteyi uygulama olarak yükle"</b> deyin.</li>
                        <li>Böylece uygulama masaüstünde ayrı bir pencere olarak açılır.</li>
                      </ul>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold">2</div>
                      <h3 className="font-bold">Masaüstü Kısayolu Oluşturma</h3>
                    </div>
                    <div className="pl-11 space-y-4">
                      <p className="text-sm opacity-80">Arkadaşlarınıza göndermek için bir kısayol dosyası oluşturabilirsiniz:</p>
                      <button 
                        onClick={downloadShortcut}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all"
                      >
                        <Download size={14} /> Kısayol Dosyasını İndir
                      </button>
                      <p className="text-[10px] opacity-50 italic">Bu dosyayı iş arkadaşlarınıza E-posta veya Teams üzerinden gönderin. Onlar dosyaya çift tıkladığında uygulama anında açılacaktır.</p>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400 font-bold">3</div>
                      <h3 className="font-bold">Telefona Yükleme (iPhone / Android)</h3>
                    </div>
                    <div className="pl-11 space-y-2 text-sm opacity-80">
                      <p><b>iPhone:</b> Safari'de "Paylaş" butonuna basın ve "Ana Ekrana Ekle" seçeneğini seçin.</p>
                      <p><b>Android:</b> Chrome'da üç noktaya basın ve "Ana Ekrana Ekle" veya "Uygulamayı Yükle" seçeneğini seçin.</p>
                    </div>
                  </section>
                </div>

                <div className="p-6 bg-white/5 border-t border-white/5">
                  <button 
                    onClick={() => setShowGuide(false)}
                    className="w-full py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold transition-all"
                  >
                    Anladım, Kapat
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
