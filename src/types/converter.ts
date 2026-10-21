export type OfficeCategory = 'word' | 'excel' | 'ppt' | 'image' | 'pdf' | 'unsupported';

export type JobStatus = 'queued' | 'converting' | 'ok' | 'skip' | 'fail';

export type CompressionLevel = 'none' | 'standard' | 'high' | 'extreme';

export interface ConvertJob {
  id: string;
  file: File;
  relativePath: string;
  extension: string;
  category: OfficeCategory;
  status: JobStatus;
  statusMessage: string;
  outputBlob?: Blob;
  outputUrl?: string;
  outputFileName?: string;
  pageCount?: number;
  durationMs?: number;
  extractedTextPreview?: string;
  tableDataPreview?: string[][];
  slideItemsPreview?: { title: string; bullets: string[] }[];
  savedToSystemFolder?: boolean;
  isEncrypted?: boolean;
  compressionLevelUsed?: CompressionLevel;
  compressionRatioPercent?: number;
}

export interface ConversionConfig {
  pageSize: 'a4' | 'letter' | 'legal';
  orientation: 'portrait' | 'landscape';
  marginMm: 10 | 18 | 25;
  fontFamily: 'helvetica' | 'times' | 'courier';
  fontSizePt: 10 | 11 | 12;
  lineHeight: 1.2 | 1.5 | 1.8;
  tableTheme: 'striped' | 'grid' | 'plain';
  includeHeader: boolean;
  headerText: string;
  includeFooter: boolean;
  footerText: string;
  includePageNumbers: boolean;
  includeCoverPageOnMerge: boolean;
  // Watermark Visual Customization
  watermarkText: string;
  watermarkColor: string;
  watermarkOpacity: number;
  watermarkFontSize: number;
  watermarkAngle: number;
  collisionPolicy: 'rename' | 'skip' | 'overwrite';
  pdfTitlePrefix: string;
  pdfAuthor: string;
  pdfSubject: string;
  // Local Encryption & Compression
  compressionLevel: CompressionLevel;
  enableEncryption: boolean;
  userPassword: string;
  ownerPassword: string;
  allowPrinting: boolean;
  allowCopying: boolean;
}

export const DEFAULT_CONVERSION_CONFIG: ConversionConfig = {
  pageSize: 'a4',
  orientation: 'portrait',
  marginMm: 18,
  fontFamily: 'helvetica',
  fontSizePt: 11,
  lineHeight: 1.5,
  tableTheme: 'striped',
  includeHeader: true,
  headerText: 'DocForge Local Offline Conversion',
  includeFooter: true,
  footerText: 'Generated 100% Offline',
  includePageNumbers: true,
  includeCoverPageOnMerge: true,
  watermarkText: '',
  watermarkColor: '#64748B',
  watermarkOpacity: 0.16,
  watermarkFontSize: 42,
  watermarkAngle: 35,
  collisionPolicy: 'rename',
  pdfTitlePrefix: '',
  pdfAuthor: 'Local User',
  pdfSubject: 'Offline Document Export',
  compressionLevel: 'standard',
  enableEncryption: false,
  userPassword: '',
  ownerPassword: '',
  allowPrinting: true,
  allowCopying: true,
};
