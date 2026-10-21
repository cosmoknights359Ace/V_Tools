export const CONVERT_BAT_SOURCE = `@echo off
REM Drag-and-drop converter: drop files/folders onto this .bat to convert them to PDF.
REM Output PDFs are written next to each source file.
python "%~dp0doctopdf.py" %*
pause
`;

export const SAMPLE_TXT_SOURCE = `Plain text file for PDF conversion test.
`;

export const DOCTOPDF_PY_SOURCE = `"""
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
`;
