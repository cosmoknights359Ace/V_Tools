@echo off
REM Drag-and-drop converter: drop files/folders onto this .bat to convert them to PDF.
REM Output PDFs are written next to each source file.
python "%~dp0doctopdf.py" %*
pause
