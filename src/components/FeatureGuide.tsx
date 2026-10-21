import React, { useState } from 'react';
import {
  Plus,
  HardDrive,
  Play,
  Lock,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Compass,
} from 'lucide-react';

interface FeatureTipItem {
  id: string;
  buttonLabel: string;
  stepTag: string;
  iconBg: string;
  icon: React.ReactNode;
  oneLiner: string;
  bullets: string[];
}

export const FEATURE_TIPS: FeatureTipItem[] = [
  {
    id: 'add-files',
    buttonLabel: 'Add Files… & Add Folder…',
    stepTag: 'Step 1 of 4 · Add Documents',
    iconBg: 'bg-indigo-600',
    icon: <Plus className="w-4 h-4 text-white" />,
    oneLiner: 'Drag and drop files or folders into the converter—100% offline.',
    bullets: [
      'Add Files…: Select Word (.docx, .txt, .rtf), Excel (.xlsx, .csv), or PowerPoint (.pptx) files.',
      'Add Folder…: Select a folder to queue all supported documents inside it at once.',
    ],
  },
  {
    id: 'security-compression',
    buttonLabel: 'Password Lock, Compression & Watermarks',
    stepTag: 'Step 2 of 4 · Customize & Protect',
    iconBg: 'bg-rose-600',
    icon: <Lock className="w-4 h-4 text-white" />,
    oneLiner: 'Shrink PDF file sizes, lock with a password, and style custom watermarks.',
    bullets: [
      'PDF Compression & Password: Set Standard/High/Extreme compression and local user passwords.',
      'Watermark Studio: Customize watermark text, color picker swatches, opacity, size, and angle.',
    ],
  },
  {
    id: 'output-folder',
    buttonLabel: 'Output Folder… & Auto-Save',
    stepTag: 'Step 3 of 4 · Where Files Go',
    iconBg: 'bg-sky-600',
    icon: <HardDrive className="w-4 h-4 text-white" />,
    oneLiner: 'Save converted PDFs straight to your computer automatically.',
    bullets: [
      'Output Folder…: Link a local folder on your system so PDFs write straight to disk.',
      'Auto-Save Toggle: Automatically downloads your PDF as soon as conversion finishes.',
    ],
  },
  {
    id: 'convert-export',
    buttonLabel: 'Convert All, ZIP & Merge',
    stepTag: 'Step 4 of 4 · Convert & Combine',
    iconBg: 'bg-emerald-600',
    icon: <Play className="w-4 h-4 text-white fill-current" />,
    oneLiner: 'Convert documents in local memory with zero internet required.',
    bullets: [
      'Convert All: Turns every queued file into a formatted, compressed PDF.',
      'Export All (.zip) & Merge into 1 PDF: Download all PDFs as a ZIP or fuse them into a single PDF.',
    ],
  },
];

interface FeatureGuideProps {
  isTourOpen: boolean;
  onCloseTour: () => void;
}

export const FeatureGuide: React.FC<FeatureGuideProps> = ({
  isTourOpen,
  onCloseTour,
}) => {
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const currentStep = FEATURE_TIPS[activeStepIndex];

  if (!isTourOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-[1px]">
      <div className="w-full max-w-md rounded-2xl theme-card border shadow-2xl overflow-hidden">
        {/* Compact Colorful Header */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 shrink-0" />
            <span className="text-sm font-bold font-display">
              Quick App Guide ({activeStepIndex + 1}/{FEATURE_TIPS.length})
            </span>
          </div>
          <button
            onClick={onCloseTour}
            className="text-xs font-semibold text-white/90 hover:text-white px-2.5 py-1 rounded-md bg-white/15 hover:bg-white/25 transition-colors cursor-pointer"
          >
            Skip Guide
          </button>
        </div>

        {/* Step Progress Bars */}
        <div className="px-5 pt-3.5 flex items-center gap-1.5">
          {FEATURE_TIPS.map((item, idx) => (
            <button
              key={item.id}
              onClick={() => setActiveStepIndex(idx)}
              className={`h-1.5 flex-1 rounded-full transition-colors cursor-pointer ${
                idx === activeStepIndex
                  ? 'bg-indigo-600'
                  : 'bg-[var(--border-strong)] hover:opacity-80'
              }`}
              aria-label={`Go to step ${idx + 1}`}
            />
          ))}
        </div>

        {/* Short, Simple Content */}
        <div className="p-5 space-y-3.5">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl ${currentStep.iconBg} flex items-center justify-center shrink-0 shadow-xs`}
            >
              {currentStep.icon}
            </div>
            <div>
              <div className="text-[11px] font-bold text-indigo-500">
                {currentStep.stepTag}
              </div>
              <h3 className="text-base font-bold text-[var(--text-primary)] font-display">
                {currentStep.buttonLabel}
              </h3>
            </div>
          </div>

          <p className="text-xs font-medium text-[var(--text-secondary)] leading-relaxed">
            {currentStep.oneLiner}
          </p>

          <ul className="space-y-2 p-3.5 rounded-xl theme-subsurface border text-xs text-[var(--text-secondary)]">
            {currentStep.bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2 leading-snug">
                <span className="text-indigo-500 font-bold">•</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Simple Footer Controls */}
        <div className="px-5 py-3 theme-subsurface border-t flex items-center justify-between">
          <button
            onClick={() => setActiveStepIndex((prev) => Math.max(0, prev - 1))}
            disabled={activeStepIndex === 0}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold theme-card border rounded-lg hover:opacity-90 disabled:opacity-40 cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back
          </button>

          {activeStepIndex < FEATURE_TIPS.length - 1 ? (
            <button
              onClick={() =>
                setActiveStepIndex((prev) => Math.min(FEATURE_TIPS.length - 1, prev + 1))
              }
              className="inline-flex items-center gap-1 px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 cursor-pointer"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={onCloseTour}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Start Converting
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
