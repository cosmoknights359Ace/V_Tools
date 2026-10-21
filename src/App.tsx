import React, { useState, useEffect, useRef, useMemo } from 'react';
import JSZip from 'jszip';
import {
  FileText,
  FolderOpen,
  Trash2,
  Play,
  Download,
  Archive,
  Layers,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  HardDrive,
  Search,
  Sliders,
  Terminal,
  Copy,
  Check,
  Plus,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  FileSpreadsheet,
  Presentation,
  FileCode,
  Sparkles,
  HelpCircle,
  ChevronDown,
  ShieldAlert,
  Beaker,
  Lock,
  KeyRound,
  Minimize2,
  Stamp,
  Palette,
  Sun,
  Moon,
} from 'lucide-react';
import {
  CompressionLevel,
  ConvertJob,
  ConversionConfig,
  DEFAULT_CONVERSION_CONFIG,
  OfficeCategory,
} from './types/converter';
import {
  getExtension,
  routeCategory,
  resolveOutputFilename,
  convertSingleJobOffline,
  mergeConvertedPdfs,
  generateSampleFile,
} from './utils/pdfConverter';
import { PWAInstallButton, OfflineIndicator } from './components/PWAInstallButton';
import { FeatureGuide } from './components/FeatureGuide';
import { CONVERT_BAT_SOURCE, DOCTOPDF_PY_SOURCE, SAMPLE_TXT_SOURCE } from './data/desktopScripts';

// File System Access API minimal typing
interface FileSystemDirectoryHandleLike {
  name: string;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
}

type ActiveTab = 'converter' | 'inspector' | 'composer' | 'scripts';
type CategoryFilter = 'all' | 'word' | 'excel' | 'ppt' | 'completed';
type PresetId = 'standard' | 'spreadsheet' | 'confidential' | 'custom';
type ThemeMode = 'light' | 'dark';

const LEGACY_BINARY_EXT = new Set(['.doc', '.ppt', '.pps', '.pot', '.wps', '.wpd']);

const WATERMARK_COLOR_SWATCHES = [
  { hex: '#64748B', label: 'Slate' },
  { hex: '#DC2626', label: 'Crimson' },
  { hex: '#2563EB', label: 'Cobalt' },
  { hex: '#059669', label: 'Emerald' },
  { hex: '#D97706', label: 'Amber' },
  { hex: '#7C3AED', label: 'Violet' },
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

function getCategoryLabel(cat: OfficeCategory): string {
  switch (cat) {
    case 'word':
      return 'Word / Document';
    case 'excel':
      return 'Excel / Sheet';
    case 'ppt':
      return 'PowerPoint / Deck';
    case 'image':
      return 'Image Asset';
    case 'pdf':
      return 'PDF Document';
    default:
      return 'Unsupported';
  }
}

function getCategoryColorStyle(cat: OfficeCategory): React.CSSProperties {
  switch (cat) {
    case 'word':
      return { color: 'var(--indigo-soft-text)' };
    case 'excel':
      return { color: 'var(--emerald-soft-text)' };
    case 'ppt':
      return { color: 'var(--amber-soft-text)' };
    case 'image':
      return { color: 'var(--sky-soft-text)' };
    case 'pdf':
      return { color: 'var(--rose-soft-text)' };
    default:
      return { color: 'var(--text-muted)' };
  }
}

export default function App() {
  // Theme state with default preference of 'light'
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('docforge-theme');
      if (saved === 'dark' || saved === 'light') {
        return saved;
      }
    } catch {
      // Ignore storage errors
    }
    return 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('docforge-theme', theme);
    } catch {
      // Ignore storage errors
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const [activeTab, setActiveTab] = useState<ActiveTab>('converter');
  const [jobs, setJobs] = useState<ConvertJob[]>([]);
  const [config, setConfig] = useState<ConversionConfig>(DEFAULT_CONVERSION_CONFIG);
  const [activePreset, setActivePreset] = useState<PresetId>('standard');
  const [openAccordion, setOpenAccordion] = useState<1 | 2 | 3 | 4 | 5 | null>(2);
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);

  const [isConverting, setIsConverting] = useState(false);
  const [autoDownloadOnConvert, setAutoDownloadOnConvert] = useState(true);
  const [progressStats, setProgressStats] = useState({ done: 0, total: 0, currentFile: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Interactive Step-by-Step Guide (Pops up every time the app is opened)
  const [isTourModalOpen, setIsTourModalOpen] = useState<boolean>(true);

  // Local System Directory Handle (File System Access API)
  const [outputDirHandle, setOutputDirHandle] = useState<FileSystemDirectoryHandleLike | null>(null);
  const [outputFolderName, setOutputFolderName] = useState<string>('Browser Downloads (Auto-Save)');
  const [statusBanner, setStatusBanner] = useState<string>(
    'Ready · Add files or folders above, or load sample files to test 100% offline conversion.'
  );

  // Merged PDF state
  const [mergedPdfUrl, setMergedPdfUrl] = useState<string | null>(null);
  const [mergedPdfBlob, setMergedPdfBlob] = useState<Blob | null>(null);
  const [mergedPageCount, setMergedPageCount] = useState<number>(0);

  // Quick Composer state
  const [composerTitle, setComposerTitle] = useState('Offline_Field_Report');
  const [composerFormat, setComposerFormat] = useState<'txt' | 'html' | 'csv'>('txt');
  const [composerBody, setComposerBody] = useState(
    `# 01. Executive Summary\nAll document conversions in DocForge Studio execute strictly in local device memory with zero external API calls.\n\n# 02. Key Offline Capabilities\n• Batch conversion for Word (.docx, .rtf, .txt, .odt, .html), Excel (.xlsx, .csv, .ods), and PowerPoint (.pptx, .odp)\n• Local PDF Password Encryption, 4-Tier Stream Compression & Visual Watermark Studio\n• Direct local directory writing or bundled ZIP archive export`
  );

  // Desktop Scripts state
  const [scriptFiles, setScriptFiles] = useState<{
    doctopdf: string;
    docgui: string;
    convertBat: string;
    sampleTxt: string;
  }>({
    doctopdf: DOCTOPDF_PY_SOURCE,
    docgui: '',
    convertBat: CONVERT_BAT_SOURCE,
    sampleTxt: SAMPLE_TXT_SOURCE,
  });
  const [activeScriptFile, setActiveScriptFile] = useState<
    'doctopdf' | 'docgui' | 'convertBat' | 'sampleTxt'
  >('doctopdf');
  const [cliOutDir, setCliOutDir] = useState('C:\\OutputPDFs');
  const [cliForce, setCliForce] = useState(true);
  const [cliInputs, setCliInputs] = useState('report.docx budget.xlsx slides/');
  const [copiedCli, setCopiedCli] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  // Load attached Python & .bat script sources in the background
  useEffect(() => {
    let mounted = true;
    async function initScriptSources() {
      try {
        const [doctopdfRes, docguiRes, batRes, sampleRes] = await Promise.allSettled([
          fetch('/assets/aistudio/doctopdf_ffbb37de.py'),
          fetch('/assets/aistudio/docgui_eb98ceb8.py'),
          fetch('/assets/aistudio/convert_55632758.bat'),
          fetch('/assets/aistudio/sample_ee952aba.txt'),
        ]);

        const nextScripts = { ...scriptFiles };
        if (doctopdfRes.status === 'fulfilled' && doctopdfRes.value.ok) {
          nextScripts.doctopdf = await doctopdfRes.value.text();
        }
        if (docguiRes.status === 'fulfilled' && docguiRes.value.ok) {
          nextScripts.docgui = await docguiRes.value.text();
        }
        if (batRes.status === 'fulfilled' && batRes.value.ok) {
          nextScripts.convertBat = await batRes.value.text();
        }
        if (sampleRes.status === 'fulfilled' && sampleRes.value.ok) {
          nextScripts.sampleTxt = await sampleRes.value.text();
        }
        if (mounted) {
          setScriptFiles(nextScripts);
        }
      } catch {
        // Offline fallback strings already loaded
      }
    }
    initScriptSources();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyPreset = (preset: PresetId) => {
    setActivePreset(preset);
    if (preset === 'standard') {
      setConfig({
        ...DEFAULT_CONVERSION_CONFIG,
        pageSize: 'a4',
        orientation: 'portrait',
        marginMm: 18,
        fontSizePt: 11,
        watermarkText: '',
        compressionLevel: 'standard',
        enableEncryption: false,
      });
    } else if (preset === 'spreadsheet') {
      setConfig({
        ...DEFAULT_CONVERSION_CONFIG,
        pageSize: 'a4',
        orientation: 'landscape',
        marginMm: 10,
        fontSizePt: 10,
        tableTheme: 'striped',
        watermarkText: '',
        compressionLevel: 'high',
        enableEncryption: false,
      });
    } else if (preset === 'confidential') {
      setConfig((prev) => ({
        ...DEFAULT_CONVERSION_CONFIG,
        pageSize: 'a4',
        orientation: 'portrait',
        marginMm: 18,
        includeHeader: true,
        headerText: 'CONFIDENTIAL · ENCRYPTED OFFLINE RECORD',
        includePageNumbers: true,
        watermarkText: 'CONFIDENTIAL',
        watermarkColor: '#DC2626',
        watermarkOpacity: 0.18,
        watermarkFontSize: 44,
        watermarkAngle: 35,
        compressionLevel: 'high',
        enableEncryption: true,
        userPassword: prev.userPassword.trim() || 'DocForge2026!',
        allowPrinting: true,
        allowCopying: false,
      }));
      setOpenAccordion(2);
    }
  };

  const updateConfigField = <K extends keyof ConversionConfig>(
    key: K,
    value: ConversionConfig[K]
  ) => {
    setActivePreset('custom');
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleGenerateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    let pass = '';
    const randomValues = new Uint32Array(12);
    window.crypto.getRandomValues(randomValues);
    for (let i = 0; i < 12; i++) {
      pass += chars[randomValues[i] % chars.length];
    }
    setActivePreset('custom');
    setConfig((prev) => ({
      ...prev,
      enableEncryption: true,
      userPassword: pass,
    }));
    setShowPasswordText(true);
  };

  const addFilesToQueue = (incomingFiles: File[], customPaths?: string[]) => {
    setJobs((prev) => {
      const existingKeys = new Set(prev.map((j) => `${j.relativePath}:${j.file.size}`));
      const added: ConvertJob[] = [];

      incomingFiles.forEach((file, idx) => {
        const relPath =
          customPaths?.[idx] ||
          (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
          file.name;
        const key = `${relPath}:${file.size}`;
        if (existingKeys.has(key)) return;
        existingKeys.add(key);

        const ext = getExtension(file.name);
        const category = routeCategory(ext);

        added.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${idx}`,
          file,
          relativePath: relPath,
          extension: ext || '(none)',
          category,
          status: 'queued',
          statusMessage: category === 'unsupported' ? `Unsupported (${ext})` : 'Queued',
        });
      });

      const next = [...prev, ...added];
      if (!selectedJobId && next.length > 0) {
        setSelectedJobId(next[0].id);
      }
      if (added.length > 0) {
        setStatusBanner(
          `Added ${added.length} file(s) to queue · Click "Convert All" to generate PDFs.`
        );
      }
      return next;
    });
  };

  // Recursive directory reader for drag-and-drop folders
  const readEntryRecursively = async (
    entry: FileSystemEntry,
    pathPrefix = ''
  ): Promise<{ file: File; path: string }[]> => {
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      return new Promise((resolve) => {
        fileEntry.file(
          (f) => resolve([{ file: f, path: pathPrefix ? `${pathPrefix}/${f.name}` : f.name }]),
          () => resolve([])
        );
      });
    }
    if (entry.isDirectory) {
      const dirEntry = entry as FileSystemDirectoryEntry;
      const reader = dirEntry.createReader();
      const allEntries: FileSystemEntry[] = [];

      const readBatch = (): Promise<FileSystemEntry[]> =>
        new Promise((resolve) => {
          reader.readEntries(
            (entries) => resolve(entries),
            () => resolve([])
          );
        });

      let batch = await readBatch();
      while (batch.length > 0) {
        allEntries.push(...batch);
        batch = await readBatch();
      }

      const nested = await Promise.all(
        allEntries.map((child) =>
          readEntryRecursively(child, pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name)
        )
      );
      return nested.flat();
    }
    return [];
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);

    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      const entries: FileSystemEntry[] = [];
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.();
        if (entry) entries.push(entry);
      }
      if (entries.length > 0) {
        const collected = (await Promise.all(entries.map((ent) => readEntryRecursively(ent)))).flat();
        if (collected.length > 0) {
          addFilesToQueue(
            collected.map((c) => c.file),
            collected.map((c) => c.path)
          );
          return;
        }
      }
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToQueue(Array.from(e.dataTransfer.files));
    }
  };

  const handleSelectOutputFolder = async () => {
    const win = window as unknown as {
      showDirectoryPicker?: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandleLike>;
    };

    if (typeof win.showDirectoryPicker === 'function') {
      try {
        const handle = await win.showDirectoryPicker({ mode: 'readwrite' });
        setOutputDirHandle(handle);
        setOutputFolderName(`Local Folder: ${handle.name}/`);
        setStatusBanner(
          `Output folder linked to "${handle.name}/" · Converted PDFs will write directly to your system.`
        );
        return;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.toLowerCase().includes('abort')) return;
      }
    }

    setOutputDirHandle(null);
    setOutputFolderName('Browser Downloads (Auto-Save)');
    setStatusBanner(
      'Browser Downloads active · Enable "Auto-Save PDFs" below to download files automatically as soon as they convert.'
    );
  };

  const writeBlobToOutputFolderIfLinked = async (filename: string, blob: Blob): Promise<boolean> => {
    if (!outputDirHandle) return false;
    try {
      const fileHandle = await outputDirHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch {
      return false;
    }
  };

  const triggerBrowserDownload = (blob: Blob, filename: string, existingUrl?: string) => {
    const url = existingUrl || URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (!existingUrl) {
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  };

  const runBatchConversion = async () => {
    if (isConverting || jobs.length === 0) return;

    if (config.enableEncryption && !config.userPassword.trim()) {
      setOpenAccordion(1);
      setStatusBanner(
        'Please enter a User Password in Section 01 (or disable password lock) before converting.'
      );
      return;
    }

    setIsConverting(true);

    const seenOutputs = new Set<string>();
    const total = jobs.length;
    let convertedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    setProgressStats({ done: 0, total, currentFile: jobs[0]?.file.name || '' });

    const updatedJobs = [...jobs];
    const newlyConvertedJobs: ConvertJob[] = [];

    for (let i = 0; i < updatedJobs.length; i++) {
      const job = updatedJobs[i];
      setProgressStats({ done: i, total, currentFile: job.file.name });

      updatedJobs[i] = { ...job, status: 'converting', statusMessage: 'Converting…' };
      setJobs([...updatedJobs]);

      const startTime = performance.now();

      try {
        if (job.category === 'unsupported') {
          skippedCount++;
          updatedJobs[i] = {
            ...job,
            status: 'skip',
            statusMessage: `Unsupported (${job.extension})`,
          };
          setJobs([...updatedJobs]);
          continue;
        }

        if (
          job.extension === '.pdf' &&
          !config.watermarkText.trim() &&
          !config.enableEncryption &&
          config.compressionLevel === 'none'
        ) {
          skippedCount++;
          const existingUrl = job.outputUrl || URL.createObjectURL(job.file);
          updatedJobs[i] = {
            ...job,
            status: 'skip',
            statusMessage: 'Already PDF',
            outputBlob: job.file,
            outputUrl: existingUrl,
            outputFileName: job.file.name,
            pageCount: 1,
          };
          setJobs([...updatedJobs]);
          continue;
        }

        const { filename, skipped } = resolveOutputFilename(
          job.file.name,
          seenOutputs,
          config.collisionPolicy
        );

        if (skipped) {
          skippedCount++;
          updatedJobs[i] = {
            ...job,
            status: 'skip',
            statusMessage: `Skipped duplicate (${filename})`,
          };
          setJobs([...updatedJobs]);
          continue;
        }

        const result = await convertSingleJobOffline(job.file, config, filename);
        const elapsed = Math.max(1, Math.round(performance.now() - startTime));
        const savedToDisk = await writeBlobToOutputFolderIfLinked(filename, result.blob);

        if (job.outputUrl) {
          URL.revokeObjectURL(job.outputUrl);
        }
        const url = URL.createObjectURL(result.blob);

        convertedCount++;
        const finishedJob: ConvertJob = {
          ...job,
          status: 'ok',
          statusMessage: savedToDisk ? `Saved → ${filename}` : filename,
          outputBlob: result.blob,
          outputUrl: url,
          outputFileName: filename,
          pageCount: result.pageCount,
          durationMs: elapsed,
          extractedTextPreview: result.extractedTextPreview,
          tableDataPreview: result.tableDataPreview,
          slideItemsPreview: result.slideItemsPreview,
          savedToSystemFolder: savedToDisk,
          isEncrypted: result.isEncrypted,
          compressionLevelUsed: result.compressionLevelUsed,
          compressionRatioPercent: result.compressionRatioPercent,
        };
        updatedJobs[i] = finishedJob;
        newlyConvertedJobs.push(finishedJob);
      } catch (err: unknown) {
        failedCount++;
        const msg = err instanceof Error ? err.message : 'Conversion failed';
        updatedJobs[i] = {
          ...job,
          status: 'fail',
          statusMessage: msg,
        };
      }

      setJobs([...updatedJobs]);
    }

    setProgressStats({ done: total, total, currentFile: 'Complete' });
    setIsConverting(false);

    if (autoDownloadOnConvert && !outputDirHandle && newlyConvertedJobs.length > 0) {
      if (newlyConvertedJobs.length === 1) {
        const single = newlyConvertedJobs[0];
        triggerBrowserDownload(single.outputBlob!, single.outputFileName!, single.outputUrl);
        setStatusBanner(`Converted & downloaded "${single.outputFileName}" automatically!`);
      } else {
        const zip = new JSZip();
        newlyConvertedJobs.forEach((j) => {
          zip.file(j.outputFileName!, j.outputBlob!);
        });
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        triggerBrowserDownload(
          zipBlob,
          `DocForge_Converted_${newlyConvertedJobs.length}_PDFs.zip`
        );
        setStatusBanner(
          `Converted ${convertedCount} files & downloaded ZIP bundle automatically!`
        );
      }
    } else {
      setStatusBanner(
        `Done · converted=${convertedCount} · skipped=${skippedCount} · failed=${failedCount}`
      );
    }

    const firstSuccess = updatedJobs.find((j) => j.status === 'ok');
    if (firstSuccess) {
      setSelectedJobId(firstSuccess.id);
    }
  };

  const handleSaveSingleFile = async (job: ConvertJob, useSavePicker = false) => {
    if (!job.outputBlob || !job.outputFileName) return;

    const win = window as unknown as {
      showSaveFilePicker?: (opts?: unknown) => Promise<{
        createWritable: () => Promise<{
          write: (data: Blob) => Promise<void>;
          close: () => Promise<void>;
        }>;
      }>;
    };

    if (useSavePicker && typeof win.showSaveFilePicker === 'function') {
      try {
        const handle = await win.showSaveFilePicker({
          suggestedName: job.outputFileName,
          types: [
            {
              description: 'PDF Document',
              accept: { 'application/pdf': ['.pdf'] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(job.outputBlob);
        await writable.close();
        setStatusBanner(`Saved ${job.outputFileName} directly to your system.`);
        return;
      } catch {
        // Fallback to standard download link
      }
    }

    triggerBrowserDownload(job.outputBlob, job.outputFileName, job.outputUrl);
    setStatusBanner(`Downloaded ${job.outputFileName} to your system.`);
  };

  const handleDownloadAllZip = async () => {
    const readyJobs = jobs.filter((j) => j.outputBlob && j.outputFileName);
    if (readyJobs.length === 0) return;

    const zip = new JSZip();
    readyJobs.forEach((j) => {
      zip.file(j.outputFileName!, j.outputBlob!);
    });

    const content = await zip.generateAsync({ type: 'blob' });
    triggerBrowserDownload(
      content,
      `DocForge_Converted_PDFs_${new Date().toISOString().slice(0, 10)}.zip`
    );
    setStatusBanner(`Exported ${readyJobs.length} PDF(s) as a single offline ZIP archive.`);
  };

  const handleMergeAllToSinglePdf = async () => {
    const readyJobs = jobs.filter((j) => j.status === 'ok' && j.outputBlob);
    if (readyJobs.length === 0) return;

    try {
      const { blob, pageCount } = await mergeConvertedPdfs(readyJobs, config);
      if (mergedPdfUrl) URL.revokeObjectURL(mergedPdfUrl);
      const url = URL.createObjectURL(blob);
      setMergedPdfBlob(blob);
      setMergedPdfUrl(url);
      setMergedPageCount(pageCount);
      setActiveTab('inspector');
      setStatusBanner(
        `Compiled ${readyJobs.length} documents into a single ${pageCount}-page PDF packet.`
      );
    } catch (err: unknown) {
      setStatusBanner(err instanceof Error ? err.message : 'Merge failed');
    }
  };

  const handleMoveJob = (id: string, direction: 'up' | 'down') => {
    setJobs((prev) => {
      const idx = prev.findIndex((j) => j.id === id);
      if (idx === -1) return prev;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(targetIdx, 0, item);
      return copy;
    });
  };

  const handleRemoveJob = (id: string) => {
    setJobs((prev) => {
      const target = prev.find((j) => j.id === id);
      if (target?.outputUrl) URL.revokeObjectURL(target.outputUrl);
      const next = prev.filter((j) => j.id !== id);
      if (selectedJobId === id) {
        setSelectedJobId(next[0]?.id || null);
      }
      return next;
    });
  };

  const handleClearQueue = () => {
    jobs.forEach((j) => {
      if (j.outputUrl) URL.revokeObjectURL(j.outputUrl);
    });
    setJobs([]);
    setSelectedJobId(null);
    setProgressStats({ done: 0, total: 0, currentFile: '' });
    setStatusBanner('Cleared file queue.');
  };

  const handleLoadSample = async (type: 'txt' | 'xlsx' | 'pptx' | 'html') => {
    const sampleFile = await generateSampleFile(type);
    addFilesToQueue([sampleFile]);
  };

  const handleLoadAllSamples = async () => {
    const [txt, xlsx, pptx] = await Promise.all([
      generateSampleFile('txt'),
      generateSampleFile('xlsx'),
      generateSampleFile('pptx'),
    ]);
    addFilesToQueue([txt, xlsx, pptx]);
  };

  const handleAddComposerDocument = async (convertImmediately: boolean) => {
    const cleanName = (composerTitle.trim() || 'Untitled_Document').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${cleanName}.${composerFormat}`;
    const mime =
      composerFormat === 'html'
        ? 'text/html'
        : composerFormat === 'csv'
        ? 'text/csv'
        : 'text/plain';
    const file = new File([composerBody], filename, { type: mime });

    if (!convertImmediately) {
      addFilesToQueue([file]);
      setActiveTab('converter');
      return;
    }

    const res = await convertSingleJobOffline(file, config, `${cleanName}.pdf`);
    const url = URL.createObjectURL(res.blob);
    const newJob: ConvertJob = {
      id: `composer-${Date.now()}`,
      file,
      relativePath: filename,
      extension: `.${composerFormat}`,
      category: composerFormat === 'csv' ? 'excel' : 'word',
      status: 'ok',
      statusMessage: `${cleanName}.pdf`,
      outputBlob: res.blob,
      outputUrl: url,
      outputFileName: `${cleanName}.pdf`,
      pageCount: res.pageCount,
      durationMs: 12,
      extractedTextPreview: res.extractedTextPreview,
      tableDataPreview: res.tableDataPreview,
      isEncrypted: res.isEncrypted,
      compressionLevelUsed: res.compressionLevelUsed,
      compressionRatioPercent: res.compressionRatioPercent,
    };

    setJobs((prev) => [newJob, ...prev]);
    setSelectedJobId(newJob.id);
    setActiveTab('inspector');
    setStatusBanner(`Compiled "${cleanName}.pdf" (${res.pageCount} page(s)) offline.`);
  };

  const handleDownloadDesktopSuiteZip = async () => {
    const zip = new JSZip();
    zip.file('doctopdf.py', scriptFiles.doctopdf);
    if (scriptFiles.docgui) {
      zip.file('docgui.py', scriptFiles.docgui);
    }
    zip.file('convert.bat', scriptFiles.convertBat);
    zip.file('sample.txt', scriptFiles.sampleTxt);

    const blob = await zip.generateAsync({ type: 'blob' });
    triggerBrowserDownload(blob, 'DocForge_Windows_COM_Offline_Suite.zip');
  };

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const matchesSearch =
        !searchQuery.trim() ||
        job.file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.relativePath.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.extension.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (categoryFilter === 'all') return true;
      if (categoryFilter === 'completed') return job.status === 'ok';
      return job.category === categoryFilter;
    });
  }, [jobs, searchQuery, categoryFilter]);

  const selectedJob = useMemo(
    () =>
      jobs.find((j) => j.id === selectedJobId) ||
      jobs.find((j) => j.status === 'ok') ||
      jobs[0] ||
      null,
    [jobs, selectedJobId]
  );

  const summaryCounts = useMemo(() => {
    const converted = jobs.filter((j) => j.status === 'ok').length;
    const skipped = jobs.filter((j) => j.status === 'skip').length;
    const failed = jobs.filter((j) => j.status === 'fail').length;
    const queued = jobs.filter((j) => j.status === 'queued').length;
    const totalBytes = jobs.reduce((acc, j) => acc + j.file.size, 0);
    return { converted, skipped, failed, queued, totalBytes };
  }, [jobs]);

  const cliCommandString = useMemo(() => {
    const parts = ['python doctopdf.py', cliInputs.trim() || 'sample.txt'];
    if (cliOutDir.trim()) {
      parts.push(`-o "${cliOutDir.trim()}"`);
    }
    if (cliForce) {
      parts.push('--force');
    }
    return parts.join(' ');
  }, [cliInputs, cliOutDir, cliForce]);

  const progressPercentage =
    progressStats.total > 0 ? Math.round((progressStats.done / progressStats.total) * 100) : 0;

  return (
    <div className="min-h-screen flex flex-col theme-app-shell border-t-4 border-t-indigo-600 transition-colors duration-200">
      {/* Top Bar Contract: Strictly 3 zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 theme-card border-b sticky top-0 z-30 shadow-2xs">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#converter"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('converter');
          }}
          className="text-lg font-bold tracking-tight bg-gradient-to-r from-indigo-500 via-violet-500 to-sky-500 bg-clip-text text-transparent font-display whitespace-nowrap shrink-0"
        >
          DocForge Studio
        </a>

        {/* Zone 2: 4 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[var(--text-secondary)]">
          <a
            href="#converter"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('converter');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'converter'
                ? 'text-indigo-500 underline underline-offset-8 decoration-2 decoration-indigo-500 font-semibold'
                : 'hover:text-indigo-500'
            }`}
          >
            Batch Converter
          </a>
          <a
            href="#inspector"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('inspector');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'inspector'
                ? 'text-indigo-500 underline underline-offset-8 decoration-2 decoration-indigo-500 font-semibold'
                : 'hover:text-indigo-500'
            }`}
          >
            PDF Inspector
          </a>
          <a
            href="#composer"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('composer');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'composer'
                ? 'text-indigo-500 underline underline-offset-8 decoration-2 decoration-indigo-500 font-semibold'
                : 'hover:text-indigo-500'
            }`}
          >
            Offline Composer
          </a>
          <a
            href="#scripts"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('scripts');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'scripts'
                ? 'text-indigo-500 underline underline-offset-8 decoration-2 decoration-indigo-500 font-semibold'
                : 'hover:text-indigo-500'
            }`}
          >
            Desktop Scripts
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            onClick={runBatchConversion}
            disabled={isConverting || jobs.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 rounded-lg hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 transition-all shadow-xs whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {isConverting ? 'Converting Queue…' : `Convert Queue (${jobs.length})`}
          </button>
        </div>
      </header>

      {/* Sub-Header Workspace Toolbar & KPI Strip */}
      <div className="theme-toolbar border-b px-6 py-2.5">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
            <span className="font-bold" style={{ color: 'var(--indigo-soft-text)' }}>
              100% Local Offline Execution
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums font-medium text-[var(--text-secondary)]">
              {jobs.length} files queued ({formatBytes(summaryCounts.totalBytes)})
            </span>
            <span aria-hidden="true">·</span>
            <span
              className="tabular-nums font-semibold"
              style={{ color: 'var(--emerald-soft-text)' }}
            >
              {summaryCounts.converted} converted
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-medium" style={{ color: 'var(--sky-soft-text)' }}>
              Compression: {config.compressionLevel.toUpperCase()}
            </span>
            {config.watermarkText.trim() && (
              <>
                <span aria-hidden="true">·</span>
                <span
                  className="font-semibold inline-flex items-center gap-1"
                  style={{ color: 'var(--violet-soft-text)' }}
                >
                  <Stamp className="w-3 h-3" />
                  Watermark: &ldquo;{config.watermarkText.trim()}&rdquo;
                </span>
              </>
            )}
            {config.enableEncryption && config.userPassword.trim() && (
              <>
                <span aria-hidden="true">·</span>
                <span
                  className="font-semibold inline-flex items-center gap-1"
                  style={{ color: 'var(--rose-soft-text)' }}
                >
                  <Lock className="w-3 h-3" />
                  Password Lock Active
                </span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Mobile view switcher */}
            <div className="flex md:hidden items-center gap-1 p-1 theme-muted-well border rounded-lg">
              {(['converter', 'inspector', 'composer', 'scripts'] as ActiveTab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize whitespace-nowrap shrink-0 ${
                    activeTab === t
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-[var(--text-secondary)]'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Light / Dark Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold theme-card border border-[var(--border-strong)] rounded-lg hover:bg-[var(--bg-surface-hover)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
              aria-label={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
            >
              {theme === 'light' ? (
                <>
                  <Moon className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Dark Mode</span>
                </>
              ) : (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>Light Mode</span>
                </>
              )}
            </button>

            {/* Single Clean Quick Guide Button */}
            <button
              onClick={() => setIsTourModalOpen(true)}
              style={{
                backgroundColor: 'var(--indigo-soft-bg)',
                borderColor: 'var(--indigo-soft-border)',
                color: 'var(--indigo-soft-text)',
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
              title="Open the 4-step Quick App Guide"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Quick Guide
            </button>

            <PWAInstallButton />
          </div>
        </div>
      </div>

      {/* Main Content Container (1440px baseline) */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6">
        {/* Short 4-Step Popup Modal (Opens automatically on app load) */}
        <FeatureGuide
          isTourOpen={isTourModalOpen}
          onCloseTour={() => setIsTourModalOpen(false)}
        />

        {/* Hidden File & Directory Inputs */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".doc,.docx,.docm,.rtf,.txt,.odt,.htm,.html,.mht,.mhtml,.xml,.wps,.wpd,.md,.json,.xls,.xlsx,.xlsm,.xlsb,.csv,.ods,.et,.tsv,.ppt,.pptx,.pptm,.pps,.ppsx,.odp,.pot,.potx,.png,.jpg,.jpeg,.webp,.pdf"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              addFilesToQueue(Array.from(e.target.files));
              e.target.value = '';
            }
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          // @ts-expect-error webkitdirectory is standard across desktop browsers
          webkitdirectory=""
          directory=""
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              addFilesToQueue(Array.from(e.target.files));
              e.target.value = '';
            }
          }}
        />

        {/* WORKSPACE 1: BATCH CONVERTER */}
        {activeTab === 'converter' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 8 Columns: Controls, Dropzone, Queue Table, Progress Bar */}
            <div className="lg:col-span-8 space-y-5">
              {/* Top Controls Bar */}
              <div className="theme-card border rounded-xl p-4 space-y-4 shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        backgroundColor: 'var(--indigo-soft-bg)',
                        borderColor: 'var(--indigo-soft-border)',
                        color: 'var(--indigo-soft-text)',
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Files…
                    </button>
                    <button
                      onClick={() => folderInputRef.current?.click()}
                      style={{
                        backgroundColor: 'var(--emerald-soft-bg)',
                        borderColor: 'var(--emerald-soft-border)',
                        color: 'var(--emerald-soft-text)',
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      Add Folder…
                    </button>
                    {jobs.length > 0 && (
                      <button
                        onClick={handleClearQueue}
                        style={{
                          backgroundColor: 'var(--rose-soft-bg)',
                          borderColor: 'var(--rose-soft-border)',
                          color: 'var(--rose-soft-text)',
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Clear Queue
                      </button>
                    )}
                  </div>

                  {/* Output Folder Selector */}
                  <div className="flex items-center gap-2 flex-1 min-w-[260px] justify-end">
                    <div
                      style={{
                        backgroundColor: 'var(--sky-soft-bg)',
                        borderColor: 'var(--sky-soft-border)',
                        color: 'var(--sky-soft-text)',
                      }}
                      className="flex-1 max-w-xs px-3 py-1.5 border rounded-lg text-xs font-mono truncate"
                      title={outputFolderName}
                    >
                      {outputFolderName}
                    </div>
                    <button
                      onClick={handleSelectOutputFolder}
                      style={{
                        backgroundColor: 'var(--sky-soft-bg)',
                        borderColor: 'var(--sky-soft-border)',
                        color: 'var(--sky-soft-text)',
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <HardDrive className="w-3.5 h-3.5" />
                      Output Folder…
                    </button>
                  </div>
                </div>

                {/* Drag-and-Drop Zone */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingOver(true);
                  }}
                  onDragLeave={() => setIsDraggingOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
                    isDraggingOver
                      ? 'border-indigo-500 theme-dropzone-active'
                      : 'theme-dropzone hover:border-indigo-400'
                  }`}
                >
                  <p className="text-sm font-bold text-[var(--text-primary)] font-display">
                    Drop files or folders here, or click to browse your device
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    <span className="font-medium" style={{ color: 'var(--indigo-soft-text)' }}>
                      Word
                    </span>{' '}
                    (.docx, .rtf, .txt, .odt, .html) ·{' '}
                    <span className="font-medium" style={{ color: 'var(--emerald-soft-text)' }}>
                      Excel
                    </span>{' '}
                    (.xlsx, .xls, .csv, .ods) ·{' '}
                    <span className="font-medium" style={{ color: 'var(--amber-soft-text)' }}>
                      PowerPoint
                    </span>{' '}
                    (.pptx, .odp) ·{' '}
                    <span className="font-medium" style={{ color: 'var(--sky-soft-text)' }}>
                      Images
                    </span>{' '}
                    (.png, .jpg)
                  </p>
                </div>
              </div>

              {/* Queue Filter & Search Bar + File Queue Table */}
              <div className="theme-card border rounded-xl overflow-hidden shadow-2xs">
                {jobs.length > 0 && (
                  <div className="p-4 border-b border-[var(--border-subtle)] theme-subsurface flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-1 p-1 theme-muted-well border rounded-lg">
                      {(
                        [
                          { id: 'all', label: `All (${jobs.length})` },
                          { id: 'word', label: 'Word & Text' },
                          { id: 'excel', label: 'Excel' },
                          { id: 'ppt', label: 'PowerPoint' },
                          { id: 'completed', label: `Converted (${summaryCounts.converted})` },
                        ] as { id: CategoryFilter; label: string }[]
                      ).map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => setCategoryFilter(tab.id)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            categoryFilter === tab.id
                              ? 'bg-indigo-600 text-white shadow-xs font-semibold'
                              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="relative min-w-[200px] flex-1 max-w-xs">
                      <Search className="w-3.5 h-3.5 text-indigo-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Filter queue by filename…"
                        className="w-full pl-8 pr-3 py-1.5 text-xs theme-input-elevated border rounded-lg focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                )}

                {/* Clean Empty State vs Populated Table */}
                {jobs.length === 0 ? (
                  <div className="p-10 text-center space-y-4">
                    <div
                      style={{
                        backgroundColor: 'var(--indigo-soft-bg)',
                        borderColor: 'var(--indigo-soft-border)',
                        color: 'var(--indigo-soft-text)',
                      }}
                      className="w-11 h-11 rounded-2xl border flex items-center justify-center mx-auto"
                    >
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="max-w-md mx-auto">
                      <h3 className="text-sm font-bold text-[var(--text-primary)] font-display">
                        Your conversion queue is empty
                      </h3>
                      <p className="mt-1 text-xs text-[var(--text-muted)] leading-relaxed">
                        Add your own Word, Excel, PowerPoint, or text files using the buttons above, or load a ready-made offline sample below to test how it works.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      <button
                        onClick={handleLoadAllSamples}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer shadow-2xs"
                      >
                        <Beaker className="w-3.5 h-3.5" />
                        Load 3 Sample Files to Test
                      </button>
                      <button
                        onClick={() => handleLoadSample('txt')}
                        style={{
                          backgroundColor: 'var(--indigo-soft-bg)',
                          borderColor: 'var(--indigo-soft-border)',
                          color: 'var(--indigo-soft-text)',
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-semibold border rounded-lg hover:opacity-90 cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        + sample.txt
                      </button>
                      <button
                        onClick={() => handleLoadSample('xlsx')}
                        style={{
                          backgroundColor: 'var(--emerald-soft-bg)',
                          borderColor: 'var(--emerald-soft-border)',
                          color: 'var(--emerald-soft-text)',
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-semibold border rounded-lg hover:opacity-90 cursor-pointer"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        + Budget.xlsx
                      </button>
                      <button
                        onClick={() => handleLoadSample('pptx')}
                        style={{
                          backgroundColor: 'var(--amber-soft-bg)',
                          borderColor: 'var(--amber-soft-border)',
                          color: 'var(--amber-soft-text)',
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-semibold border rounded-lg hover:opacity-90 cursor-pointer"
                      >
                        <Presentation className="w-3.5 h-3.5" />
                        + Slides.pptx
                      </button>
                      <button
                        onClick={() => handleLoadSample('html')}
                        style={{
                          backgroundColor: 'var(--sky-soft-bg)',
                          borderColor: 'var(--sky-soft-border)',
                          color: 'var(--sky-soft-text)',
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-semibold border rounded-lg hover:opacity-90 cursor-pointer"
                      >
                        <FileCode className="w-3.5 h-3.5" />
                        + Report.html
                      </button>
                    </div>
                  </div>
                ) : filteredJobs.length === 0 ? (
                  <div className="p-10 text-center">
                    <p className="text-xs font-semibold text-[var(--text-secondary)]">
                      No queued files match your filter.
                    </p>
                    <button
                      onClick={() => {
                        setCategoryFilter('all');
                        setSearchQuery('');
                      }}
                      className="mt-2 text-xs font-semibold text-indigo-500 hover:underline cursor-pointer"
                    >
                      Show all queued files
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b theme-table-head text-[11px] font-semibold">
                          <th className="py-2.5 pl-4 pr-2 w-10">#</th>
                          <th className="py-2.5 px-3">Source Document</th>
                          <th className="py-2.5 px-3">Format &amp; Size</th>
                          <th className="py-2.5 px-3">Status &amp; Output</th>
                          <th className="py-2.5 pl-3 pr-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
                        {filteredJobs.map((job, idx) => {
                          const isSelected = selectedJob?.id === job.id;
                          const isLegacyBinary = LEGACY_BINARY_EXT.has(job.extension);
                          return (
                            <tr
                              key={job.id}
                              onClick={() => {
                                setSelectedJobId(job.id);
                                if (job.outputBlob) {
                                  setMergedPdfUrl(null);
                                  setActiveTab('inspector');
                                }
                              }}
                              className={`transition-colors cursor-pointer theme-table-row ${
                                isSelected ? 'theme-table-row-selected' : ''
                              }`}
                            >
                              <td className="py-2.5 pl-4 pr-2 font-mono text-[var(--text-muted)] tabular-nums">
                                {String(idx + 1).padStart(2, '0')}
                              </td>
                              <td className="py-2.5 px-3 max-w-[260px]">
                                <div
                                  className="font-semibold text-[var(--text-primary)] truncate"
                                  title={job.relativePath}
                                >
                                  {job.relativePath}
                                </div>
                                <div className="text-[11px] text-[var(--text-muted)] flex flex-wrap items-center gap-1.5 mt-0.5">
                                  <span
                                    className="font-medium"
                                    style={getCategoryColorStyle(job.category)}
                                  >
                                    {getCategoryLabel(job.category)}
                                  </span>
                                  {job.pageCount !== undefined && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className="font-mono tabular-nums">
                                        {job.pageCount} pg
                                      </span>
                                    </>
                                  )}
                                  {job.compressionRatioPercent !== undefined &&
                                    job.compressionRatioPercent > 0 && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <span
                                          className="font-mono tabular-nums font-medium"
                                          style={{ color: 'var(--sky-soft-text)' }}
                                        >
                                          -{job.compressionRatioPercent}% size
                                        </span>
                                      </>
                                    )}
                                  {job.isEncrypted && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span
                                        className="font-semibold inline-flex items-center gap-0.5"
                                        style={{ color: 'var(--rose-soft-text)' }}
                                      >
                                        <Lock className="w-3 h-3" />
                                        Encrypted
                                      </span>
                                    </>
                                  )}
                                  {isLegacyBinary && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveTab('scripts');
                                      }}
                                      style={{ color: 'var(--amber-soft-text)' }}
                                      className="hover:underline font-medium inline-flex items-center gap-0.5 cursor-pointer"
                                      title="Legacy 97-2003 binary format: use doctopdf.py for full MS Office COM layout"
                                    >
                                      · Legacy format (Use COM Script →)
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[var(--text-secondary)] tabular-nums whitespace-nowrap">
                                <span className="font-semibold text-[var(--text-primary)]">
                                  {job.extension}
                                </span>
                                <span className="mx-1.5 text-[var(--text-faint)]">·</span>
                                <span>{formatBytes(job.file.size)}</span>
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                {job.status === 'ok' && (
                                  <span
                                    className="inline-flex items-center gap-1.5 font-semibold"
                                    style={{ color: 'var(--emerald-soft-text)' }}
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                    <span>Converted · {job.statusMessage}</span>
                                  </span>
                                )}
                                {job.status === 'queued' && (
                                  <span
                                    className="inline-flex items-center gap-1.5 font-medium"
                                    style={{ color: 'var(--indigo-soft-text)' }}
                                  >
                                    <Clock className="w-3.5 h-3.5 shrink-0" />
                                    <span>Ready to convert</span>
                                  </span>
                                )}
                                {job.status === 'converting' && (
                                  <span
                                    className="inline-flex items-center gap-1.5 font-semibold"
                                    style={{ color: 'var(--sky-soft-text)' }}
                                  >
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                                    <span>Converting…</span>
                                  </span>
                                )}
                                {job.status === 'skip' && (
                                  <span
                                    className="inline-flex items-center gap-1.5 font-medium"
                                    style={{ color: 'var(--amber-soft-text)' }}
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                    <span>{job.statusMessage}</span>
                                  </span>
                                )}
                                {job.status === 'fail' && (
                                  <span
                                    className="inline-flex items-center gap-1.5 font-medium"
                                    style={{ color: 'var(--rose-soft-text)' }}
                                  >
                                    <XCircle className="w-3.5 h-3.5 shrink-0" />
                                    <span>{job.statusMessage}</span>
                                  </span>
                                )}
                              </td>
                              <td
                                className="py-2.5 pl-3 pr-4 text-right whitespace-nowrap"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="inline-flex items-center gap-1">
                                  {job.outputBlob && (
                                    <>
                                      <button
                                        onClick={() => {
                                          setSelectedJobId(job.id);
                                          setMergedPdfUrl(null);
                                          setActiveTab('inspector');
                                        }}
                                        style={{
                                          backgroundColor: 'var(--indigo-soft-bg)',
                                          color: 'var(--indigo-soft-text)',
                                        }}
                                        className="px-2 py-1 text-xs font-semibold hover:opacity-90 rounded-md transition-opacity cursor-pointer"
                                      >
                                        <Eye className="w-3.5 h-3.5 inline mr-1" />
                                        Preview
                                      </button>
                                      <button
                                        onClick={() => handleSaveSingleFile(job, false)}
                                        className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors cursor-pointer"
                                      >
                                        <Download className="w-3.5 h-3.5 inline mr-1" />
                                        Save PDF
                                      </button>
                                    </>
                                  )}
                                  <button
                                    onClick={() => handleMoveJob(job.id, 'up')}
                                    className="p-1 text-[var(--text-muted)] hover:text-indigo-500 rounded cursor-pointer"
                                    title="Move up"
                                  >
                                    <ArrowUp className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleMoveJob(job.id, 'down')}
                                    className="p-1 text-[var(--text-muted)] hover:text-indigo-500 rounded cursor-pointer"
                                    title="Move down"
                                  >
                                    <ArrowDown className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleRemoveJob(job.id)}
                                    className="p-1 text-[var(--text-muted)] hover:text-rose-500 rounded cursor-pointer"
                                    title="Remove"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Bottom Progress & One-Step Auto-Save Bar */}
                <div className="p-4 theme-progress-footer border-t space-y-3">
                  <div className="w-full h-2 bg-[var(--border-subtle)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-600 via-violet-600 to-emerald-500 transition-transform duration-150 origin-left"
                      style={{
                        transform: `scaleX(${
                          isConverting
                            ? Math.max(0.05, progressPercentage / 100)
                            : summaryCounts.converted > 0
                            ? 1
                            : 0
                        })`,
                      }}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xs font-mono text-[var(--text-secondary)] tabular-nums">
                        {statusBanner}
                      </p>
                      <label className="inline-flex items-center gap-2 text-xs font-medium text-[var(--text-muted)] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={autoDownloadOnConvert}
                          onChange={(e) => setAutoDownloadOnConvert(e.target.checked)}
                          className="rounded border-[var(--border-strong)] accent-indigo-600"
                        />
                        <span>Auto-download PDF(s) immediately when conversion finishes</span>
                      </label>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={handleDownloadAllZip}
                        disabled={summaryCounts.converted === 0}
                        style={{
                          backgroundColor: 'var(--amber-soft-bg)',
                          borderColor: 'var(--amber-soft-border)',
                          color: 'var(--amber-soft-text)',
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        Export All (.zip)
                      </button>
                      <button
                        onClick={handleMergeAllToSinglePdf}
                        disabled={summaryCounts.converted === 0}
                        style={{
                          backgroundColor: 'var(--violet-soft-bg)',
                          borderColor: 'var(--violet-soft-border)',
                          color: 'var(--violet-soft-text)',
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        Merge into 1 PDF
                      </button>
                      <button
                        onClick={runBatchConversion}
                        disabled={isConverting || jobs.length === 0}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 rounded-lg hover:from-indigo-700 hover:to-violet-700 disabled:opacity-40 transition-all shadow-xs whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        {isConverting ? 'Converting…' : 'Convert All'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right 4 Columns: PDF Output Settings with Local Password Encryption, Compression & Watermark Studio */}
            <aside className="lg:col-span-4 theme-card border rounded-xl p-5 space-y-4 shadow-2xs">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                  <div
                    style={{
                      backgroundColor: 'var(--indigo-soft-bg)',
                      color: 'var(--indigo-soft-text)',
                    }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                  >
                    <Sliders className="w-4 h-4" />
                  </div>
                  <h2 className="text-sm font-bold text-[var(--text-primary)] font-display">
                    PDF Output Settings
                  </h2>
                </div>
                <button
                  onClick={() => applyPreset('standard')}
                  className="text-xs font-semibold text-indigo-500 hover:underline cursor-pointer"
                >
                  Reset
                </button>
              </div>

              {/* 3 One-Click Quick Presets */}
              <div className="space-y-2">
                <span className="block text-[11px] font-bold text-[var(--text-muted)]">
                  Quick Layout Presets
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => applyPreset('standard')}
                    className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                      activePreset === 'standard'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                        : 'theme-subsurface hover:bg-[var(--bg-surface-hover)]'
                    }`}
                  >
                    <div className="text-xs font-bold font-display">Standard</div>
                    <div
                      className={`text-[10px] mt-0.5 ${
                        activePreset === 'standard' ? 'text-indigo-100' : 'text-[var(--text-muted)]'
                      }`}
                    >
                      A4 · Balanced
                    </div>
                  </button>

                  <button
                    onClick={() => applyPreset('spreadsheet')}
                    className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                      activePreset === 'spreadsheet'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                        : 'theme-subsurface hover:bg-[var(--bg-surface-hover)]'
                    }`}
                  >
                    <div className="text-xs font-bold font-display">Wide Sheet</div>
                    <div
                      className={`text-[10px] mt-0.5 ${
                        activePreset === 'spreadsheet'
                          ? 'text-emerald-100'
                          : 'text-[var(--text-muted)]'
                      }`}
                    >
                      Landscape · High
                    </div>
                  </button>

                  <button
                    onClick={() => applyPreset('confidential')}
                    className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                      activePreset === 'confidential'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                        : 'theme-subsurface hover:bg-[var(--bg-surface-hover)]'
                    }`}
                  >
                    <div className="text-xs font-bold font-display">Locked</div>
                    <div
                      className={`text-[10px] mt-0.5 ${
                        activePreset === 'confidential' ? 'text-rose-100' : 'text-[var(--text-muted)]'
                      }`}
                    >
                      Password + Stamp
                    </div>
                  </button>
                </div>
              </div>

              {/* Collapsible Accordion 1: Local Password Encryption & PDF Compression */}
              <div
                style={{ borderColor: 'var(--indigo-soft-border)' }}
                className="border rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setOpenAccordion(openAccordion === 1 ? null : 1)}
                  style={{
                    backgroundColor: 'var(--indigo-soft-bg)',
                    color: 'var(--indigo-soft-text)',
                  }}
                  className="w-full px-3.5 py-2.5 hover:opacity-90 flex items-center justify-between text-xs font-bold cursor-pointer"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    01. Password Encryption &amp; Compression
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${
                      openAccordion === 1 ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {openAccordion === 1 && (
                  <div className="p-3.5 space-y-4 theme-card border-t border-[var(--border-subtle)]">
                    {/* PDF Compression Level */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-[var(--text-secondary)] inline-flex items-center gap-1">
                          <Minimize2 className="w-3 h-3 text-sky-500" />
                          PDF Compression Level
                        </span>
                        <span
                          className="text-[10px] font-mono font-semibold"
                          style={{ color: 'var(--sky-soft-text)' }}
                        >
                          {config.compressionLevel === 'extreme'
                            ? '~58% smaller'
                            : config.compressionLevel === 'high'
                            ? '~44% smaller'
                            : config.compressionLevel === 'standard'
                            ? '~29% smaller'
                            : 'Uncompressed'}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {(
                          [
                            { id: 'none', label: 'None' },
                            { id: 'standard', label: 'Standard' },
                            { id: 'high', label: 'High' },
                            { id: 'extreme', label: 'Extreme' },
                          ] as { id: CompressionLevel; label: string }[]
                        ).map((lvl) => (
                          <button
                            key={lvl.id}
                            onClick={() => updateConfigField('compressionLevel', lvl.id)}
                            className={`py-1.5 px-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                              config.compressionLevel === lvl.id
                                ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                                : 'theme-subsurface hover:bg-[var(--bg-surface-hover)]'
                            }`}
                          >
                            {lvl.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] leading-snug">
                        {config.compressionLevel === 'extreme'
                          ? 'Maximum FlateDecode stream compression + 96 DPI image downsampling & compact spacing.'
                          : config.compressionLevel === 'high'
                          ? 'High-ratio FlateDecode stream compression + 150 DPI smart image optimization.'
                          : config.compressionLevel === 'standard'
                          ? 'Lossless FlateDecode PDF stream & object compression with full image resolution.'
                          : 'Raw uncompressed PDF streams for fastest output.'}
                      </p>
                    </div>

                    {/* Local User Password Encryption */}
                    <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2.5">
                      <label className="flex items-center justify-between text-xs font-bold text-[var(--text-primary)] cursor-pointer">
                        <span className="inline-flex items-center gap-1.5">
                          <KeyRound className="w-3.5 h-3.5 text-rose-500" />
                          Encrypt PDF with User Password
                        </span>
                        <input
                          type="checkbox"
                          checked={config.enableEncryption}
                          onChange={(e) => updateConfigField('enableEncryption', e.target.checked)}
                          className="rounded border-[var(--border-strong)] accent-rose-600"
                        />
                      </label>

                      {config.enableEncryption && (
                        <div
                          style={{
                            backgroundColor: 'var(--rose-soft-bg)',
                            borderColor: 'var(--rose-soft-border)',
                          }}
                          className="space-y-2.5 p-3 rounded-xl border"
                        >
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span
                                className="text-[11px] font-semibold"
                                style={{ color: 'var(--rose-soft-text)' }}
                              >
                                User Password (Required to Open PDF)
                              </span>
                              <button
                                type="button"
                                onClick={handleGenerateRandomPassword}
                                className="text-[11px] font-semibold text-indigo-500 hover:underline cursor-pointer"
                              >
                                Generate Strong
                              </button>
                            </div>
                            <div className="relative flex items-center">
                              <input
                                type={showPasswordText ? 'text' : 'password'}
                                value={config.userPassword}
                                onChange={(e) => updateConfigField('userPassword', e.target.value)}
                                placeholder="Enter password to lock PDF…"
                                className="w-full pl-2.5 pr-16 py-1.5 text-xs font-mono theme-input-elevated border rounded-lg focus:outline-none focus:border-rose-500"
                              />
                              <div className="absolute right-1.5 flex items-center gap-1">
                                {config.userPassword && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(config.userPassword);
                                      setCopiedPassword(true);
                                      setTimeout(() => setCopiedPassword(false), 1800);
                                    }}
                                    className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded cursor-pointer"
                                    title="Copy password"
                                  >
                                    {copiedPassword ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setShowPasswordText(!showPasswordText)}
                                  className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded cursor-pointer"
                                  title={showPasswordText ? 'Hide password' : 'Show password'}
                                >
                                  {showPasswordText ? (
                                    <EyeOff className="w-3.5 h-3.5" />
                                  ) : (
                                    <Eye className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-1.5 pt-1">
                            <span
                              className="block text-[11px] font-semibold"
                              style={{ color: 'var(--rose-soft-text)' }}
                            >
                              Encrypted Document Permissions
                            </span>
                            <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
                              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={config.allowPrinting}
                                  onChange={(e) =>
                                    updateConfigField('allowPrinting', e.target.checked)
                                  }
                                  className="rounded border-[var(--border-strong)] accent-rose-600"
                                />
                                <span>Allow Printing</span>
                              </label>
                              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={config.allowCopying}
                                  onChange={(e) =>
                                    updateConfigField('allowCopying', e.target.checked)
                                  }
                                  className="rounded border-[var(--border-strong)] accent-rose-600"
                                />
                                <span>Allow Copy Text</span>
                              </label>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Collapsible Accordion 2: Watermark Studio (Color Picker, Opacity Slider & Live Page Preview) */}
              <div
                style={{ borderColor: 'var(--violet-soft-border)' }}
                className="border rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setOpenAccordion(openAccordion === 2 ? null : 2)}
                  style={{
                    backgroundColor: 'var(--violet-soft-bg)',
                    color: 'var(--violet-soft-text)',
                  }}
                  className="w-full px-3.5 py-2.5 hover:opacity-90 flex items-center justify-between text-xs font-bold cursor-pointer"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Stamp className="w-3.5 h-3.5" />
                    02. Watermark Studio (Color &amp; Opacity)
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${
                      openAccordion === 2 ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {openAccordion === 2 && (
                  <div className="p-3.5 space-y-3.5 theme-card border-t border-[var(--border-subtle)]">
                    {/* Watermark Text Input & Quick Stamps */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-[var(--text-secondary)]">
                          Watermark Text
                        </span>
                        {config.watermarkText && (
                          <button
                            type="button"
                            onClick={() => updateConfigField('watermarkText', '')}
                            className="text-[10px] font-semibold text-rose-500 hover:underline cursor-pointer"
                          >
                            Clear Watermark
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={config.watermarkText}
                        onChange={(e) => updateConfigField('watermarkText', e.target.value)}
                        placeholder="e.g. CONFIDENTIAL, DRAFT, DO NOT COPY"
                        className="w-full px-2.5 py-1.5 text-xs theme-input border rounded-lg focus:outline-none focus:border-violet-500"
                      />
                      <div className="flex flex-wrap items-center gap-1 pt-0.5">
                        {(['CONFIDENTIAL', 'DRAFT', 'DO NOT COPY', 'APPROVED'] as const).map(
                          (stamp) => (
                            <button
                              key={stamp}
                              type="button"
                              onClick={() => updateConfigField('watermarkText', stamp)}
                              className={`px-2 py-0.5 text-[10px] font-semibold rounded border transition-colors cursor-pointer ${
                                config.watermarkText === stamp
                                  ? 'bg-violet-600 text-white border-violet-600'
                                  : 'theme-subsurface hover:bg-[var(--bg-surface-hover)]'
                              }`}
                            >
                              {stamp}
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    {/* Color Picker + Curated Swatches */}
                    <div className="space-y-1.5 pt-2 border-t border-[var(--border-subtle)]">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-[var(--text-secondary)] inline-flex items-center gap-1">
                          <Palette className="w-3 h-3 text-violet-500" />
                          Watermark Color
                        </span>
                        <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase">
                          {config.watermarkColor}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <label className="inline-flex items-center gap-2 px-2.5 py-1 theme-subsurface border rounded-lg cursor-pointer hover:bg-[var(--bg-surface-hover)]">
                          <input
                            type="color"
                            value={config.watermarkColor}
                            onChange={(e) => updateConfigField('watermarkColor', e.target.value)}
                            className="w-5 h-5 rounded border-0 cursor-pointer bg-transparent"
                            aria-label="Pick custom watermark color"
                          />
                          <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                            Custom Picker
                          </span>
                        </label>

                        <div className="flex items-center gap-1.5">
                          {WATERMARK_COLOR_SWATCHES.map((swatch) => {
                            const isSelected =
                              config.watermarkColor.toLowerCase() === swatch.hex.toLowerCase();
                            return (
                              <button
                                key={swatch.hex}
                                type="button"
                                onClick={() => updateConfigField('watermarkColor', swatch.hex)}
                                className={`w-5 h-5 rounded-full border transition-transform cursor-pointer ${
                                  isSelected
                                    ? 'scale-110 ring-2 ring-offset-1 ring-violet-500 border-white'
                                    : 'border-[var(--border-strong)] hover:scale-105'
                                }`}
                                style={{ backgroundColor: swatch.hex }}
                                title={`${swatch.label} (${swatch.hex})`}
                                aria-label={`Select ${swatch.label} watermark color`}
                              />
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Opacity Slider */}
                    <div className="space-y-1 pt-2 border-t border-[var(--border-subtle)]">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-[var(--text-secondary)]">
                          Watermark Opacity
                        </span>
                        <span
                          className="font-mono font-semibold tabular-nums"
                          style={{ color: 'var(--violet-soft-text)' }}
                        >
                          {Math.round(config.watermarkOpacity * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={4}
                        max={65}
                        step={1}
                        value={Math.round(config.watermarkOpacity * 100)}
                        onChange={(e) =>
                          updateConfigField('watermarkOpacity', Number(e.target.value) / 100)
                        }
                        className="w-full accent-violet-600 cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
                        <span>Subtle (4%)</span>
                        <span>Balanced (18%)</span>
                        <span>Bold (65%)</span>
                      </div>
                    </div>

                    {/* Font Size & Rotation Angle Sliders */}
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[var(--border-subtle)]">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-medium text-[var(--text-secondary)]">Size</span>
                          <span className="font-mono text-[var(--text-secondary)] tabular-nums">
                            {config.watermarkFontSize} pt
                          </span>
                        </div>
                        <input
                          type="range"
                          min={20}
                          max={72}
                          step={2}
                          value={config.watermarkFontSize}
                          onChange={(e) =>
                            updateConfigField('watermarkFontSize', Number(e.target.value))
                          }
                          className="w-full accent-violet-600 cursor-pointer"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-medium text-[var(--text-secondary)]">Rotation</span>
                          <span className="font-mono text-[var(--text-secondary)] tabular-nums">
                            {config.watermarkAngle}°
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-60}
                          max={60}
                          step={5}
                          value={config.watermarkAngle}
                          onChange={(e) =>
                            updateConfigField('watermarkAngle', Number(e.target.value))
                          }
                          className="w-full accent-violet-600 cursor-pointer"
                        />
                      </div>
                    </div>

                    {/* Live Miniature PDF Page Watermark Preview */}
                    <div className="pt-2 border-t border-[var(--border-subtle)]">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                          Live PDF Page Appearance Preview
                        </span>
                        <span className="text-[10px] font-mono text-[var(--text-muted)]">
                          {config.watermarkText.trim() ? 'Active on every page' : 'No stamp'}
                        </span>
                      </div>
                      <div className="relative h-24 w-full rounded-lg border border-[var(--border-strong)] bg-white overflow-hidden flex items-center justify-center shadow-inner">
                        {/* Simulated page lines on white PDF sheet */}
                        <div className="w-full px-4 space-y-2 pointer-events-none select-none">
                          <div className="h-1.5 w-2/5 bg-slate-200 rounded" />
                          <div className="h-1 w-4/5 bg-slate-100 rounded" />
                          <div className="h-1 w-3/4 bg-slate-100 rounded" />
                          <div className="h-1 w-2/3 bg-slate-100 rounded" />
                        </div>
                        {/* Live Watermark Stamp Overlay */}
                        {config.watermarkText.trim() ? (
                          <div
                            className="absolute inset-0 flex items-center justify-center pointer-events-none select-none font-bold tracking-wider text-center px-2"
                            style={{
                              color: config.watermarkColor,
                              opacity: config.watermarkOpacity,
                              fontSize: `${Math.max(
                                12,
                                Math.round(config.watermarkFontSize * 0.48)
                              )}px`,
                              transform: `rotate(${-config.watermarkAngle}deg)`,
                            }}
                          >
                            {config.watermarkText}
                          </div>
                        ) : (
                          <span className="absolute text-[11px] text-slate-400 italic">
                            Type watermark text above to preview
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Collapsible Accordion 3: Page Geometry */}
              <div className="border border-[var(--border-subtle)] rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenAccordion(openAccordion === 3 ? null : 3)}
                  className="w-full px-3.5 py-2.5 theme-subsurface hover:bg-[var(--bg-surface-hover)] flex items-center justify-between text-xs font-bold text-[var(--text-primary)] cursor-pointer"
                >
                  <span>03. Page Size, Orientation &amp; Margins</span>
                  <ChevronDown
                    className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${
                      openAccordion === 3 ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {openAccordion === 3 && (
                  <div className="p-3.5 space-y-3 theme-card border-t border-[var(--border-subtle)]">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <span className="block text-[11px] text-[var(--text-muted)] mb-1">
                          Paper Size
                        </span>
                        <select
                          value={config.pageSize}
                          onChange={(e) =>
                            updateConfigField(
                              'pageSize',
                              e.target.value as ConversionConfig['pageSize']
                            )
                          }
                          className="w-full px-2.5 py-1.5 text-xs theme-input border rounded-lg"
                        >
                          <option value="a4">ISO A4</option>
                          <option value="letter">US Letter</option>
                          <option value="legal">US Legal</option>
                        </select>
                      </div>
                      <div>
                        <span className="block text-[11px] text-[var(--text-muted)] mb-1">
                          Orientation
                        </span>
                        <select
                          value={config.orientation}
                          onChange={(e) =>
                            updateConfigField(
                              'orientation',
                              e.target.value as ConversionConfig['orientation']
                            )
                          }
                          className="w-full px-2.5 py-1.5 text-xs theme-input border rounded-lg"
                        >
                          <option value="portrait">Portrait</option>
                          <option value="landscape">Landscape</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {([10, 18, 25] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => updateConfigField('marginMm', m)}
                          className={`py-1.5 px-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                            config.marginMm === m
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'theme-subsurface hover:bg-[var(--bg-surface-hover)]'
                          }`}
                        >
                          {m === 10 ? '10mm' : m === 18 ? '18mm' : '25mm'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Collapsible Accordion 4: Typography & Spreadsheet Grid */}
              <div className="border border-[var(--border-subtle)] rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenAccordion(openAccordion === 4 ? null : 4)}
                  className="w-full px-3.5 py-2.5 theme-subsurface hover:bg-[var(--bg-surface-hover)] flex items-center justify-between text-xs font-bold text-[var(--text-primary)] cursor-pointer"
                >
                  <span>04. Fonts, Table Grid &amp; Duplicates</span>
                  <ChevronDown
                    className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${
                      openAccordion === 4 ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {openAccordion === 4 && (
                  <div className="p-3.5 space-y-3 theme-card border-t border-[var(--border-subtle)]">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <span className="block text-[11px] text-[var(--text-muted)] mb-1">
                          Font Family
                        </span>
                        <select
                          value={config.fontFamily}
                          onChange={(e) =>
                            updateConfigField(
                              'fontFamily',
                              e.target.value as ConversionConfig['fontFamily']
                            )
                          }
                          className="w-full px-2.5 py-1.5 text-xs theme-input border rounded-lg"
                        >
                          <option value="helvetica">Helvetica (Sans)</option>
                          <option value="times">Times Roman (Serif)</option>
                          <option value="courier">Courier (Mono)</option>
                        </select>
                      </div>
                      <div>
                        <span className="block text-[11px] text-[var(--text-muted)] mb-1">
                          Excel Table Style
                        </span>
                        <select
                          value={config.tableTheme}
                          onChange={(e) =>
                            updateConfigField(
                              'tableTheme',
                              e.target.value as ConversionConfig['tableTheme']
                            )
                          }
                          className="w-full px-2.5 py-1.5 text-xs theme-input border rounded-lg"
                        >
                          <option value="striped">Striped Ledger</option>
                          <option value="grid">Full Bordered Grid</option>
                          <option value="plain">Clean Minimal</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <span className="block text-[11px] text-[var(--text-muted)] mb-1">
                          Base Font Size
                        </span>
                        <select
                          value={config.fontSizePt}
                          onChange={(e) =>
                            updateConfigField(
                              'fontSizePt',
                              Number(e.target.value) as ConversionConfig['fontSizePt']
                            )
                          }
                          className="w-full px-2.5 py-1.5 text-xs theme-input border rounded-lg"
                        >
                          <option value={10}>10 pt (Compact)</option>
                          <option value={11}>11 pt (Standard)</option>
                          <option value={12}>12 pt (Large)</option>
                        </select>
                      </div>
                      <div>
                        <span className="block text-[11px] text-[var(--text-muted)] mb-1">
                          Duplicate Names
                        </span>
                        <select
                          value={config.collisionPolicy}
                          onChange={(e) =>
                            updateConfigField(
                              'collisionPolicy',
                              e.target.value as ConversionConfig['collisionPolicy']
                            )
                          }
                          className="w-full px-2.5 py-1.5 text-xs theme-input border rounded-lg"
                        >
                          <option value="rename">Auto-Rename (_2)</option>
                          <option value="overwrite">Force Overwrite</option>
                          <option value="skip">Skip Existing</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Collapsible Accordion 5: Headers & Page Numbers */}
              <div className="border border-[var(--border-subtle)] rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenAccordion(openAccordion === 5 ? null : 5)}
                  className="w-full px-3.5 py-2.5 theme-subsurface hover:bg-[var(--bg-surface-hover)] flex items-center justify-between text-xs font-bold text-[var(--text-primary)] cursor-pointer"
                >
                  <span>05. Headers &amp; Page Numbers</span>
                  <ChevronDown
                    className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${
                      openAccordion === 5 ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {openAccordion === 5 && (
                  <div className="p-3.5 space-y-3 theme-card border-t border-[var(--border-subtle)]">
                    <label className="flex items-center justify-between text-xs text-[var(--text-secondary)] cursor-pointer">
                      <span>Include Running Header</span>
                      <input
                        type="checkbox"
                        checked={config.includeHeader}
                        onChange={(e) => updateConfigField('includeHeader', e.target.checked)}
                        className="rounded border-[var(--border-strong)] accent-indigo-600"
                      />
                    </label>

                    {config.includeHeader && (
                      <input
                        type="text"
                        value={config.headerText}
                        onChange={(e) => updateConfigField('headerText', e.target.value)}
                        placeholder="Header text…"
                        className="w-full px-2.5 py-1.5 text-xs theme-input border rounded-lg"
                      />
                    )}

                    <label className="flex items-center justify-between text-xs text-[var(--text-secondary)] cursor-pointer">
                      <span>Page Numbers (Page X of Y)</span>
                      <input
                        type="checkbox"
                        checked={config.includePageNumbers}
                        onChange={(e) => {
                          updateConfigField('includePageNumbers', e.target.checked);
                          updateConfigField('includeFooter', e.target.checked);
                        }}
                        className="rounded border-[var(--border-strong)] accent-indigo-600"
                      />
                    </label>
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}

        {/* WORKSPACE 2: PDF INSPECTOR & LIVE VIEWER */}
        {activeTab === 'inspector' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 4 Columns: Converted Document Selector */}
            <div className="lg:col-span-4 theme-card border rounded-xl p-5 space-y-4 shadow-2xs">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                <h2 className="text-sm font-bold text-[var(--text-primary)] font-display">
                  Queued &amp; Converted Files ({jobs.length})
                </h2>
                {summaryCounts.converted > 1 && (
                  <button
                    onClick={handleMergeAllToSinglePdf}
                    className="text-xs font-semibold text-indigo-500 hover:underline underline-offset-4 cursor-pointer"
                  >
                    Compile Merged PDF
                  </button>
                )}
              </div>

              {mergedPdfUrl && (
                <div className="p-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl space-y-2 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Merged Compilation Packet</span>
                    <span className="text-xs font-mono tabular-nums">{mergedPageCount} pages</span>
                  </div>
                  <button
                    onClick={() => {
                      if (!mergedPdfBlob) return;
                      triggerBrowserDownload(
                        mergedPdfBlob,
                        'DocForge_Merged_Packet.pdf',
                        mergedPdfUrl
                      );
                    }}
                    className="w-full py-1.5 px-3 text-xs font-semibold bg-white text-indigo-900 rounded-md hover:bg-indigo-50 transition-colors cursor-pointer"
                  >
                    Save Merged PDF to System
                  </button>
                </div>
              )}

              {jobs.length === 0 ? (
                <div className="p-6 text-center space-y-3 theme-subsurface rounded-xl border">
                  <p className="text-xs text-[var(--text-muted)]">No files in your queue yet.</p>
                  <button
                    onClick={() => setActiveTab('converter')}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 cursor-pointer"
                  >
                    Go to Batch Converter
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
                  {jobs.map((job) => (
                    <button
                      key={job.id}
                      onClick={() => {
                        setMergedPdfUrl(null);
                        setSelectedJobId(job.id);
                      }}
                      className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                        selectedJob?.id === job.id && !mergedPdfUrl
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'theme-subsurface hover:bg-[var(--bg-surface-hover)]'
                      }`}
                    >
                      <div className="text-xs font-semibold truncate">{job.file.name}</div>
                      <div
                        className={`text-[11px] mt-1 flex items-center gap-1.5 ${
                          selectedJob?.id === job.id && !mergedPdfUrl
                            ? 'text-indigo-100'
                            : 'text-[var(--text-muted)]'
                        }`}
                      >
                        <span>{job.status.toUpperCase()}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{formatBytes(job.file.size)}</span>
                        {job.pageCount && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">{job.pageCount} pg</span>
                          </>
                        )}
                        {job.isEncrypted && (
                          <>
                            <span aria-hidden="true">·</span>
                            <Lock className="w-3 h-3 inline" />
                          </>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Right 8 Columns: Embedded PDF Frame + Extracted Structure */}
            <div className="lg:col-span-8 theme-card border rounded-xl p-5 space-y-5 shadow-2xs">
              {mergedPdfUrl ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
                    <div>
                      <h3 className="text-base font-bold text-[var(--text-primary)] font-display">
                        DocForge_Merged_Packet.pdf
                      </h3>
                      <p className="text-xs text-[var(--text-muted)]">
                        Unified PDF compilation · {mergedPageCount} pages · Generated 100% offline
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (!mergedPdfBlob) return;
                        triggerBrowserDownload(
                          mergedPdfBlob,
                          'DocForge_Merged_Packet.pdf',
                          mergedPdfUrl
                        );
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Save Merged PDF
                    </button>
                  </div>
                  <iframe
                    src={mergedPdfUrl}
                    title="Merged PDF Preview"
                    className="w-full h-[600px] border border-[var(--border-subtle)] rounded-lg theme-muted-well"
                  />
                </div>
              ) : selectedJob ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
                    <div>
                      <h3 className="text-base font-bold text-[var(--text-primary)] font-display">
                        {selectedJob.outputFileName || selectedJob.file.name}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)] mt-0.5">
                        <span
                          className="font-medium"
                          style={getCategoryColorStyle(selectedJob.category)}
                        >
                          {getCategoryLabel(selectedJob.category)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          Source: {formatBytes(selectedJob.file.size)}
                        </span>
                        {selectedJob.outputBlob && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span
                              className="font-mono tabular-nums font-medium"
                              style={{ color: 'var(--emerald-soft-text)' }}
                            >
                              PDF: {formatBytes(selectedJob.outputBlob.size)}
                            </span>
                          </>
                        )}
                        {selectedJob.compressionRatioPercent !== undefined &&
                          selectedJob.compressionRatioPercent > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span
                                className="font-mono tabular-nums font-semibold"
                                style={{ color: 'var(--sky-soft-text)' }}
                              >
                                Compressed (-{selectedJob.compressionRatioPercent}%)
                              </span>
                            </>
                          )}
                        {selectedJob.isEncrypted && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span
                              className="font-semibold inline-flex items-center gap-1"
                              style={{ color: 'var(--rose-soft-text)' }}
                            >
                              <Lock className="w-3 h-3" />
                              Password Encrypted
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!selectedJob.outputBlob ? (
                        <button
                          onClick={runBatchConversion}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          Convert Now
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => handleSaveSingleFile(selectedJob, true)}
                            style={{
                              backgroundColor: 'var(--sky-soft-bg)',
                              borderColor: 'var(--sky-soft-border)',
                              color: 'var(--sky-soft-text)',
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border rounded-lg hover:opacity-90 cursor-pointer"
                          >
                            <HardDrive className="w-3.5 h-3.5" />
                            Save As to System…
                          </button>
                          <button
                            onClick={() => handleSaveSingleFile(selectedJob, false)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download PDF
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {selectedJob.isEncrypted && config.userPassword && (
                    <div
                      style={{
                        backgroundColor: 'var(--rose-soft-bg)',
                        borderColor: 'var(--rose-soft-border)',
                        color: 'var(--rose-soft-text)',
                      }}
                      className="p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 shrink-0" />
                        <span>
                          This PDF is encrypted with your local User Password. Enter{' '}
                          <code className="font-mono font-bold px-1.5 py-0.5 theme-card rounded border">
                            {config.userPassword}
                          </code>{' '}
                          when prompted by your PDF viewer.
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(config.userPassword);
                          setCopiedPassword(true);
                          setTimeout(() => setCopiedPassword(false), 1800);
                        }}
                        className="px-2.5 py-1 text-xs font-semibold theme-card border rounded-md hover:opacity-90 cursor-pointer"
                      >
                        {copiedPassword ? 'Copied Password' : 'Copy Password'}
                      </button>
                    </div>
                  )}

                  {selectedJob.outputUrl ? (
                    <iframe
                      src={selectedJob.outputUrl}
                      title="Converted PDF Preview"
                      className="w-full h-[520px] border border-[var(--border-subtle)] rounded-lg theme-muted-well"
                    />
                  ) : (
                    <div
                      style={{
                        backgroundColor: 'var(--indigo-soft-bg)',
                        borderColor: 'var(--indigo-soft-border)',
                      }}
                      className="p-10 text-center border rounded-lg"
                    >
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        This document is queued for conversion
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        Click &ldquo;Convert Now&rdquo; to compile the PDF in local memory and preview it here.
                      </p>
                    </div>
                  )}

                  {/* Extracted Content / Table / Slide Structure Inspector */}
                  {selectedJob.tableDataPreview && selectedJob.tableDataPreview.length > 0 && (
                    <div className="space-y-2 pt-3 border-t border-[var(--border-subtle)]">
                      <h4
                        className="text-xs font-semibold"
                        style={{ color: 'var(--emerald-soft-text)' }}
                      >
                        Parsed Spreadsheet Grid Preview (First {selectedJob.tableDataPreview.length}{' '}
                        rows)
                      </h4>
                      <div className="overflow-x-auto border border-[var(--border-subtle)] rounded-lg">
                        <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                          <tbody>
                            {selectedJob.tableDataPreview.slice(0, 8).map((row, rIdx) => (
                              <tr
                                key={rIdx}
                                className={
                                  rIdx === 0
                                    ? 'bg-emerald-700 text-white font-semibold'
                                    : 'border-t border-[var(--border-subtle)] even:bg-[var(--bg-surface-subtle)]'
                                }
                              >
                                {row.map((cell, cIdx) => (
                                  <td key={cIdx} className="px-3 py-1.5 whitespace-nowrap">
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {selectedJob.slideItemsPreview && selectedJob.slideItemsPreview.length > 0 && (
                    <div className="space-y-2 pt-3 border-t border-[var(--border-subtle)]">
                      <h4
                        className="text-xs font-semibold"
                        style={{ color: 'var(--amber-soft-text)' }}
                      >
                        Extracted Presentation Deck Structure (
                        {selectedJob.slideItemsPreview.length} slides)
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {selectedJob.slideItemsPreview.map((s, idx) => (
                          <div
                            key={idx}
                            style={{
                              backgroundColor: 'var(--amber-soft-bg)',
                              borderColor: 'var(--amber-soft-border)',
                            }}
                            className="p-3 border rounded-lg"
                          >
                            <div className="text-xs font-bold text-[var(--text-primary)]">
                              Slide {idx + 1}: {s.title}
                            </div>
                            <ul className="mt-1.5 space-y-1 text-xs text-[var(--text-secondary)] list-disc list-inside">
                              {s.bullets.slice(0, 4).map((b, bIdx) => (
                                <li key={bIdx} className="truncate">
                                  {b}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedJob.extractedTextPreview && (
                    <div className="space-y-2 pt-3 border-t border-[var(--border-subtle)]">
                      <h4
                        className="text-xs font-semibold"
                        style={{ color: 'var(--indigo-soft-text)' }}
                      >
                        Extracted Document Text Stream
                      </h4>
                      <pre className="p-3 theme-subsurface border rounded-lg text-xs font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {selectedJob.extractedTextPreview}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-12 text-center">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    No document selected
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    Convert a document in the Batch Converter tab to inspect and preview its PDF output.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* WORKSPACE 3: OFFLINE DOCUMENT COMPOSER */}
        {activeTab === 'composer' && (
          <div className="theme-card border rounded-xl p-6 space-y-5 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]">
              <div>
                <h2 className="text-base font-bold text-[var(--text-primary)] font-display">
                  01. Offline Document &amp; Table-to-PDF Composer
                </h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Author plain text, Markdown notes, HTML reports, or CSV tables directly in the browser and compile to PDF offline.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleAddComposerDocument(false)}
                  style={{
                    backgroundColor: 'var(--indigo-soft-bg)',
                    borderColor: 'var(--indigo-soft-border)',
                    color: 'var(--indigo-soft-text)',
                  }}
                  className="px-3.5 py-2 text-xs font-semibold border rounded-lg hover:opacity-90 cursor-pointer"
                >
                  Add to Batch Queue
                </button>
                <button
                  onClick={() => handleAddComposerDocument(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 rounded-lg hover:from-indigo-700 hover:to-violet-700 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Compile &amp; Preview PDF Now
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Document Filename (without extension)
                </label>
                <input
                  type="text"
                  value={composerTitle}
                  onChange={(e) => setComposerTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono theme-input border rounded-lg focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Source Format Mode
                </label>
                <select
                  value={composerFormat}
                  onChange={(e) => {
                    const nextFmt = e.target.value as 'txt' | 'html' | 'csv';
                    setComposerFormat(nextFmt);
                    if (nextFmt === 'csv') {
                      setComposerBody(
                        `Item Code,Component Name,Quantity,Unit Cost ($),Line Total ($)\nHW-101,Offline Compute Node,4,1250.00,5000.00\nHW-204,Encrypted NVMe Array,8,340.00,2720.00\nSW-309,Local PDF License,1,0.00,0.00`
                      );
                    }
                  }}
                  className="w-full px-3 py-2 text-xs theme-input border rounded-lg focus:border-indigo-500 focus:outline-none"
                >
                  <option value="txt">Structured Text / Markdown (.txt)</option>
                  <option value="html">HTML Markup Document (.html)</option>
                  <option value="csv">Comma-Separated Spreadsheet (.csv)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                Document Content
              </label>
              <textarea
                rows={14}
                value={composerBody}
                onChange={(e) => setComposerBody(e.target.value)}
                className="w-full p-4 text-xs font-mono leading-relaxed theme-input border rounded-xl focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        )}

        {/* WORKSPACE 4: DESKTOP MS OFFICE COM SUITE (doctopdf.py / docgui.py / convert.bat) */}
        {activeTab === 'scripts' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 theme-card border rounded-xl p-5 space-y-5 shadow-2xs">
              <div className="pb-3 border-b border-[var(--border-subtle)]">
                <h2 className="text-base font-bold text-[var(--text-primary)] font-display">
                  01. Native Windows MS Office COM Suite
                </h2>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Your companion Python +{' '}
                  <code className="font-mono" style={{ color: 'var(--indigo-soft-text)' }}>
                    win32com
                  </code>{' '}
                  scripts for local Microsoft Word, Excel, and PowerPoint automation (including legacy{' '}
                  <code className="font-mono">.doc</code> and <code className="font-mono">.ppt</code>{' '}
                  files).
                </p>
              </div>

              <div
                style={{
                  backgroundColor: 'var(--amber-soft-bg)',
                  borderColor: 'var(--amber-soft-border)',
                  color: 'var(--amber-soft-text)',
                }}
                className="p-3.5 rounded-xl border flex items-start gap-2.5 text-xs"
              >
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">When to use the Python COM scripts: </span>
                  Use <code className="font-mono">doctopdf.py</code> or{' '}
                  <code className="font-mono">docgui.py</code> on Windows when converting older
                  1997–2003 binary <code className="font-mono">.doc</code> /{' '}
                  <code className="font-mono">.ppt</code> files or complex macros that require local
                  MS Office rendering.
                </div>
              </div>

              {/* CLI Command Builder for doctopdf.py */}
              <div className="space-y-3">
                <label
                  className="block text-xs font-semibold"
                  style={{ color: 'var(--indigo-soft-text)' }}
                >
                  Interactive Command Builder (<code className="font-mono">doctopdf.py</code>)
                </label>

                <div>
                  <span className="block text-[11px] text-[var(--text-muted)] mb-1">
                    Input Files or Folders
                  </span>
                  <input
                    type="text"
                    value={cliInputs}
                    onChange={(e) => setCliInputs(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-mono theme-input border rounded-lg"
                  />
                </div>

                <div>
                  <span className="block text-[11px] text-[var(--text-muted)] mb-1">
                    Output Directory (<code className="font-mono">-o / --output-dir</code>)
                  </span>
                  <input
                    type="text"
                    value={cliOutDir}
                    onChange={(e) => setCliOutDir(e.target.value)}
                    placeholder="Leave blank to output next to each source file"
                    className="w-full px-3 py-1.5 text-xs font-mono theme-input border rounded-lg"
                  />
                </div>

                <label className="flex items-center justify-between text-xs text-[var(--text-secondary)] cursor-pointer pt-1">
                  <span>
                    Force Overwrite Existing PDFs (<code className="font-mono">--force</code>)
                  </span>
                  <input
                    type="checkbox"
                    checked={cliForce}
                    onChange={(e) => setCliForce(e.target.checked)}
                    className="rounded border-[var(--border-strong)] accent-indigo-600"
                  />
                </label>

                <div className="p-3 bg-slate-900 text-slate-100 rounded-lg font-mono text-xs flex items-center justify-between gap-2 border border-slate-800">
                  <code className="truncate text-emerald-300">{cliCommandString}</code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(cliCommandString);
                      setCopiedCli(true);
                      setTimeout(() => setCopiedCli(false), 2000);
                    }}
                    className="px-2.5 py-1 text-xs font-sans font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded shrink-0 cursor-pointer"
                  >
                    {copiedCli ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--border-subtle)] space-y-2.5">
                <button
                  onClick={handleDownloadDesktopSuiteZip}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 rounded-lg hover:from-indigo-700 hover:to-violet-700 transition-all cursor-pointer shadow-xs"
                >
                  <Archive className="w-4 h-4" />
                  Download Complete Python + .bat Offline Bundle (.zip)
                </button>
              </div>
            </div>

            {/* Right 7 Columns: Source Code Viewer for attached files */}
            <div className="lg:col-span-7 theme-card border rounded-xl overflow-hidden shadow-2xs">
              <div className="px-4 py-3 theme-subsurface border-b flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 p-1 theme-muted-well border rounded-lg">
                  {(
                    [
                      { id: 'doctopdf', label: 'doctopdf.py' },
                      { id: 'docgui', label: 'docgui.py' },
                      { id: 'convertBat', label: 'convert.bat' },
                      { id: 'sampleTxt', label: 'sample.txt' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveScriptFile(tab.id)}
                      className={`px-3 py-1 text-xs font-mono rounded-md transition-colors cursor-pointer ${
                        activeScriptFile === tab.id
                          ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => {
                    navigator.clipboard.writeText(scriptFiles[activeScriptFile] || '');
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 2000);
                  }}
                  style={{
                    backgroundColor: 'var(--indigo-soft-bg)',
                    borderColor: 'var(--indigo-soft-border)',
                    color: 'var(--indigo-soft-text)',
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border rounded-lg hover:opacity-90 cursor-pointer"
                >
                  {copiedCode ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copiedCode ? 'Copied Source' : 'Copy Source'}
                </button>
              </div>

              <div className="p-4 bg-slate-950 text-slate-100 overflow-x-auto max-h-[540px] overflow-y-auto">
                <pre className="text-xs font-mono leading-relaxed">
                  {scriptFiles[activeScriptFile] || '# Loading script source...'}
                </pre>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Clean Quiet Footer */}
      <footer className="mt-auto border-t theme-card px-6 py-4">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-[var(--text-muted)]">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[var(--text-primary)]">
              DocForge Local PDF Studio
            </span>
            <span aria-hidden="true">·</span>
            <span>Zero Cloud Dependencies</span>
            <span aria-hidden="true">·</span>
            <span>All file parsing, encryption &amp; compression runs locally on your machine</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={toggleTheme}
              className="hover:text-[var(--text-primary)] font-medium transition-colors cursor-pointer inline-flex items-center gap-1"
            >
              {theme === 'light' ? (
                <>
                  <Moon className="w-3.5 h-3.5 text-indigo-500" />
                  Dark Mode
                </>
              ) : (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  Light Mode
                </>
              )}
            </button>
            <button
              onClick={() => setIsTourModalOpen(true)}
              className="text-indigo-500 hover:underline font-medium transition-colors cursor-pointer inline-flex items-center gap-1"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Quick Guide
            </button>
            <button
              onClick={() => setActiveTab('scripts')}
              className="hover:text-[var(--text-primary)] transition-colors cursor-pointer inline-flex items-center gap-1"
            >
              <Terminal className="w-3.5 h-3.5" />
              Windows COM Scripts (doctopdf.py)
            </button>
          </div>
        </div>
      </footer>

      <OfflineIndicator />
    </div>
  );
}
