"""
doctopdf.py - Convert common document formats to PDF, 100% offline.

Uses the locally installed Microsoft Office (Word, Excel, PowerPoint) via
COM automation to export files to PDF. No internet, no cloud, no external
services. Supported inputs:

    Word:      .doc .docx .docm .rtf .txt .odt .htm .html .mht .mhtml .xml .wps
    Excel:     .xls .xlsx .xlsm .xlsb .csv .ods .et
    PowerPoint: .ppt .pptx .pptm .pps .ppsx .odp .pot .potx

Usage:
    python doctopdf.py <files_or_folders...> [-o OUTPUT_DIR] [--force]
    python doctopdf.py file1.docx file2.xlsx folder/  (multiple inputs)

Drop files onto convert.bat to convert them in place.
"""

import os
import sys
import argparse
import win32com.client

# --- file type -> office app routing -----------------------------------------
WORD_EXT = {".doc", ".docx", ".docm", ".rtf", ".txt", ".odt", ".htm", ".html",
            ".mht", ".mhtml", ".xml", ".wps", ".wpd"}
EXCEL_EXT = {".xls", ".xlsx", ".xlsm", ".xlsb", ".csv", ".ods", ".et"}
PPT_EXT = {".ppt", ".pptx", ".pptm", ".pps", ".ppsx", ".odp", ".pot", ".potx"}

# PDF export format constants
WD_FORMAT_PDF = 17        # Word SaveAs2 FileFormat
XL_TYPE_PDF = 0           # Excel ExportAsFixedFormat type
PP_SAVEAS_PDF = 32        # PowerPoint SaveAs FileFormat (ppSaveAsPDF)


def _abs(path):
    return os.path.abspath(os.path.normpath(path))


def _output_path(src, out_dir, seen=None):
    base = os.path.splitext(os.path.basename(src))[0]
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
        cand = os.path.join(out_dir, base + ".pdf")
    else:
        cand = os.path.splitext(src)[0] + ".pdf"
    # Avoid clobbering a PDF produced from a different file earlier in the run.
    if seen is not None and cand in seen:
        i = 1
        while True:
            i += 1
            if out_dir:
                cand = os.path.join(out_dir, f"{base}_{i}.pdf")
            else:
                cand = f"{os.path.splitext(src)[0]}_{i}.pdf"
            if cand not in seen:
                break
    if seen is not None:
        seen.add(cand)
    return cand


def _convert_word(word, src, out):
    doc = word.Documents.Open(_abs(src))
    if doc is None:
        raise RuntimeError("Word could not open the document")
    try:
        doc.SaveAs2(_abs(out), FileFormat=WD_FORMAT_PDF)
    finally:
        doc.Close(False)


def _convert_excel(excel, src, out):
    wb = excel.Workbooks.Open(_abs(src))
    if wb is None:
        raise RuntimeError("Excel could not open the workbook")
    try:
        wb.ExportAsFixedFormat(XL_TYPE_PDF, _abs(out))
    finally:
        wb.Close(False)


def _convert_powerpoint(ppt, src, out):
    # Open(FileName, ReadOnly, Untitled, WithWindow)
    pres = ppt.Presentations.Open(_abs(src), False, False, False)
    if pres is None:
        raise RuntimeError("PowerPoint could not open the presentation")
    try:
        # ExportAsFixedFormat has unreliable COM bindings via pywin32; SaveAs
        # with FileFormat=32 (ppSaveAsPDF) is the robust path.
        pres.SaveAs(_abs(out), PP_SAVEAS_PDF)
    finally:
        pres.Close()


class _OfficePool:
    """Lazily creates one hidden Office instance per app type and reuses it
    for the whole batch. Uses DispatchEx so we never attach to (and quit)
    any Office window the user already has open. PowerPoint must be visible,
    so it runs minimized."""

    def __init__(self):
        self._word = None
        self._excel = None
        self._ppt = None

    def word(self):
        if self._word is None:
            self._word = win32com.client.DispatchEx("Word.Application")
            self._word.Visible = False
            self._word.DisplayAlerts = False
            # msoAutomationSecurityLow: open fully, no Protected View prompts
            # (which would otherwise block Open on downloaded files).
            try:
                self._word.AutomationSecurity = 1
            except Exception:
                pass
        return self._word

    def excel(self):
        if self._excel is None:
            self._excel = win32com.client.DispatchEx("Excel.Application")
            self._excel.Visible = False
            self._excel.DisplayAlerts = False
        return self._excel

    def powerpoint(self):
        if self._ppt is None:
            self._ppt = win32com.client.DispatchEx("PowerPoint.Application")
            self._ppt.Visible = True
            self._ppt.WindowState = 2  # ppWindowMinimized
        return self._ppt

    def reset(self, app):
        # Drop a wedged instance so the next call rebuilds a fresh one.
        obj = getattr(self, "_" + app, None)
        if obj is not None:
            try:
                obj.Quit()
            except Exception:
                pass
            setattr(self, "_" + app, None)

    def quit_all(self):
        for app in ("word", "excel", "ppt"):
            self.reset(app)


def _route_app(ext):
    if ext in WORD_EXT:
        return "word"
    if ext in EXCEL_EXT:
        return "excel"
    if ext in PPT_EXT:
        return "ppt"
    return None


def _run_in_pool(pool, src, out, app):
    if app == "word":
        _convert_word(pool.word(), src, out)
    elif app == "excel":
        _convert_excel(pool.excel(), src, out)
    else:
        _convert_powerpoint(pool.powerpoint(), src, out)


def _convert_one(pool, src, out_dir, force, seen):
    """Convert a single already-validated file using a shared pool.
    Returns the output path, or 'skip'/'fail' with details via exception."""
    src = _abs(src)
    ext = os.path.splitext(src)[1].lower()
    if ext == ".pdf":
        return src  # already a PDF

    app = _route_app(ext)
    if app is None:
        raise ValueError(f"Unsupported file type: {ext}")

    out = _output_path(src, out_dir, seen)
    if os.path.exists(out) and not force:
        raise FileExistsError(f"Output already exists: {os.path.basename(out)}")

    try:
        _run_in_pool(pool, src, out, app)
    except Exception as e:
        # A wedged Office instance can poison later conversions; reset it.
        pool.reset(app)
        raise RuntimeError(f"{os.path.basename(src)}: {e}")

    if not os.path.exists(out):
        raise RuntimeError(f"{os.path.basename(src)}: no output produced")
    return out


def convert_to_pdf(src, out_dir=None, force=False, seen=None, pool=None):
    """Convert a single document file to PDF.

    Returns the output PDF path on success (equal to src if already a PDF).
    Raises ValueError for unsupported types and RuntimeError on failure.
    A temporary Office pool is created and torn down unless one is supplied.
    """
    src = _abs(src)
    if not os.path.isfile(src):
        raise FileNotFoundError(f"Input not found: {src}")

    owned = pool is None
    if owned:
        pool = _OfficePool()
    try:
        return _convert_one(pool, src, out_dir, force, seen)
    finally:
        if owned:
            pool.quit_all()


def convert_files(paths, out_dir=None, force=False, progress=None):
    """Convert many files, reusing one Office instance per app type.

    `progress` (optional) is called as progress(done, total, name, status,
    message) where status is 'ok' | 'skip' | 'fail'. Returns a summary dict.
    """
    pool = _OfficePool()
    seen_files = set()
    seen_outputs = set()
    results = {"converted": [], "skipped": [], "failed": []}
    try:
        jobs = list(_iter_supported(paths))
        total = len(jobs)
        done = 0
        for src in jobs:
            if src in seen_files:
                done += 1
                continue
            seen_files.add(src)
            name = os.path.basename(src)
            try:
                out = _convert_one(pool, src, out_dir, force, seen_outputs)
                if out.lower() == src.lower():
                    results["skipped"].append((name, "already PDF"))
                    status, msg = "skip", "already PDF"
                else:
                    results["converted"].append((name, os.path.basename(out)))
                    status, msg = "ok", os.path.basename(out)
            except (ValueError, FileExistsError) as e:
                results["skipped"].append((name, str(e)))
                status, msg = "skip", str(e)
            except Exception as e:
                results["failed"].append((name, str(e)))
                status, msg = "fail", str(e)
            done += 1
            if progress:
                progress(done, total, name, status, msg)
    finally:
        pool.quit_all()
    return results


def _iter_supported(paths):
    for p in paths:
        p = _abs(p)
        if os.path.isdir(p):
            for root, _dirs, files in os.walk(p):
                for f in files:
                    yield os.path.join(root, f)
        else:
            yield p


def is_supported(path):
    return _route_app(os.path.splitext(path)[1].lower()) is not None


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Convert common document formats to PDF (offline, via MS Office).")
    parser.add_argument("inputs", nargs="+",
                        help="Files and/or folders to convert.")
    parser.add_argument("-o", "--output-dir", default=None,
                        help="Optional output folder (default: next to each input).")
    parser.add_argument("--force", action="store_true",
                        help="Overwrite existing PDFs.")
    args = parser.parse_args(argv)

    def _progress(done, total, name, status, msg):
        tag = {"ok": " ok ", "skip": "skip", "fail": "fail"}[status]
        print(f"[{tag}] {name} -> {msg}")

    res = convert_files(args.inputs, args.output_dir, args.force, _progress)
    c, s, f = (len(res["converted"]), len(res["skipped"]), len(res["failed"]))
    print(f"\nDone. converted={c} skipped={s} failed={f}")
    return 1 if f else 0


if __name__ == "__main__":
    sys.exit(main())
