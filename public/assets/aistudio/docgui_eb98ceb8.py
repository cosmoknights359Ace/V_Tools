"""
docgui.py - Simple offline GUI for doctopdf.py.

Drag files/folders onto the window (or use the buttons), pick an output
folder, and convert. Fully offline; uses the local MS Office via COM.

Run:  python docgui.py
"""

import os
import ctypes
import threading
import tkinter as tk
from tkinter import ttk, filedialog, messagebox

import pythoncom

import doctopdf


# --- native drag-and-drop (no external packages) ----------------------------
def _enable_drop(widget):
    """Enable shell drag-and-drop (WM_DROPFILES) for a Tk widget."""
    from ctypes import wintypes

    ctypes.windll.ole32.CoInitializeEx(0, 0x2)  # COINIT_APARTMENTTHREADED
    hwnd = widget.winfo_id()
    ctypes.windll.shell32.DragAcceptFiles(hwnd, True)

    WNDPROC = ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_void_p, ctypes.c_uint,
                                 ctypes.c_void_p, ctypes.c_void_p)
    ctypes.windll.user32.GetWindowLongW.restype = ctypes.c_void_p
    ctypes.windll.user32.SetWindowLongW.restype = ctypes.c_void_p
    ctypes.windll.user32.SetWindowLongW.argtypes = [
        ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p]

    orig = {"ptr": ctypes.windll.user32.GetWindowLongW(hwnd, -4)}

    def wndproc(h, msg, wp, lp):
        if msg == 0x0233:  # WM_DROPFILES
            count = ctypes.windll.shell32.DragQueryFile(wp, 0xFFFFFFFF, None, 0)
            buf = ctypes.create_unicode_buffer(1024)
            paths = []
            for i in range(count):
                ctypes.windll.shell32.DragQueryFile(wp, i, buf, 1024)
                paths.append(buf.value)
            ctypes.windll.shell32.DragFinish(wp)
            widget.event_generate("<<Drop>>", data="\n".join(paths))
            return 0
        return ctypes.windll.user32.CallWindowProcW(orig["ptr"], h, msg, wp, lp)

    new = WNDPROC(wndproc)
    ctypes.windll.user32.SetWindowLongW(hwnd, -4, new)
    widget._drop_wndproc = new  # keep alive


class ConverterGUI:
    def __init__(self, root):
        self.root = root
        root.title("Doc → PDF Converter (offline)")
        root.geometry("720x520")
        root.minsize(560, 400)

        self.files = []          # list of absolute paths (files + folders)
        self.running = False

        # --- top controls ---
        frm = ttk.Frame(root, padding=10)
        frm.pack(fill="x")
        ttk.Button(frm, text="Add Files…", command=self.add_files).pack(side="left")
        ttk.Button(frm, text="Add Folder…", command=self.add_folder).pack(side="left", padx=6)
        ttk.Button(frm, text="Clear", command=self.clear).pack(side="left")
        ttk.Button(frm, text="Output Folder…", command=self.choose_out).pack(side="right")

        self.out_var = tk.StringVar(value=os.getcwd())
        out = ttk.Entry(frm, textvariable=self.out_var, state="readonly")
        out.pack(side="right", fill="x", expand=True, padx=6)

        # --- file list ---
        list_frame = ttk.Frame(root, padding=(10, 0, 10, 0))
        list_frame.pack(fill="both", expand=True)
        cols = ("name", "status")
        self.tree = ttk.Treeview(list_frame, columns=cols, show="headings", height=12)
        self.tree.heading("name", text="File")
        self.tree.heading("status", text="Status")
        self.tree.column("name", width=480)
        self.tree.column("status", width=140)
        self.tree.pack(side="left", fill="both", expand=True)
        vsb = ttk.Scrollbar(list_frame, orient="vertical", command=self.tree.yview)
        vsb.pack(side="right", fill="y")
        self.tree.configure(yscrollcommand=vsb.set)

        # --- drop target on the tree ---
        try:
            _enable_drop(self.tree)
        except Exception as e:
            print("Drag-drop unavailable:", e)

        # --- bottom bar ---
        bottom = ttk.Frame(root, padding=10)
        bottom.pack(fill="x")
        self.progress = ttk.Progressbar(bottom, orient="horizontal",
                                        mode="determinate", maximum=100)
        self.progress.pack(fill="x")
        self.status = ttk.Label(bottom, text="Ready. Add files or drag them here.")
        self.status.pack(anchor="w", pady=(4, 0))

        self.convert_btn = ttk.Button(bottom, text="Convert", command=self.start)
        self.convert_btn.pack(pady=(8, 0))

        self.tree.bind("<<Drop>>", self.on_drop)

    # --- drag and drop ---
    def on_drop(self, event):
        data = event.data
        if not data:
            return
        paths = [p for p in data.split("\n") if p.strip()]
        self.add_paths(paths)

    # --- file management ---
    def add_files(self):
        paths = filedialog.askopenfilenames(
            title="Select documents",
            filetypes=[("Documents", "*.doc;*.docx;*.docm;*.rtf;*.txt;*.odt;*.htm;*.html;*.xml;*.mht;*.mhtml;*.xls;*.xlsx;*.xlsm;*.xlsb;*.csv;*.ods;*.ppt;*.pptx;*.pptm;*.pps;*.ppsx;*.odp"),
                       ("All files", "*.*")])
        self.add_paths(list(paths))

    def add_folder(self):
        folder = filedialog.askdirectory(title="Select folder")
        if folder:
            self.add_paths([folder])

    def add_paths(self, paths):
        changed = False
        for p in paths:
            p = os.path.abspath(os.path.normpath(p))
            if p not in self.files:
                self.files.append(p)
                changed = True
        if changed:
            self.refresh_list()

    def clear(self):
        self.files = []
        self.refresh_list()

    def choose_out(self):
        folder = filedialog.askdirectory(title="Output folder",
                                         initialdir=self.out_var.get())
        if folder:
            self.out_var.set(folder)

    def refresh_list(self):
        for row in self.tree.get_children():
            self.tree.delete(row)
        for p in self.files:
            label = p if os.path.isdir(p) else os.path.basename(p)
            self.tree.insert("", "end", values=(label, "queued"))

    # --- conversion ---
    def start(self):
        if self.running:
            return
        if not self.files:
            messagebox.showinfo("Nothing to do", "Add files or folders first.")
            return
        out_dir = self.out_var.get() or None
        self.running = True
        self.convert_btn.configure(state="disabled", text="Converting…")
        self.progress["value"] = 0

        thread = threading.Thread(
            target=self._worker, args=(list(self.files), out_dir, False),
            daemon=True)
        thread.start()

    def _worker(self, paths, out_dir, force):
        pythoncom.CoInitialize()

        def progress(done, total, name, status, msg):
            self.root.after(0, self._on_progress, done, total, name, status, msg)

        try:
            res = doctopdf.convert_files(paths, out_dir, force, progress)
        except Exception as e:
            self.root.after(0, self._on_error, str(e))
            return
        finally:
            pythoncom.CoUninitialize()
        self.root.after(0, self._on_done, res)

    def _on_progress(self, done, total, name, status, msg):
        if total:
            self.progress["value"] = int(done / total * 100)
        self.status.configure(text=f"{done}/{total}  {name}: {status}")
        base = os.path.basename(name)
        for item in self.tree.get_children():
            vals = self.tree.item(item, "values")
            if vals and vals[0] == base:
                self.tree.item(item, values=(vals[0], status))
                return
        self.tree.insert("", "end", values=(base, status))

    def _on_error(self, msg):
        self.status.configure(text="Error: " + msg)
        self._finish()

    def _on_done(self, res):
        c = len(res["converted"])
        s = len(res["skipped"])
        f = len(res["failed"])
        self.status.configure(text=f"Done. converted={c} skipped={s} failed={f}")
        if f:
            messagebox.showwarning("Completed with errors",
                                   f"{f} file(s) failed. See the list for details.")
        self._finish()

    def _finish(self):
        self.running = False
        self.convert_btn.configure(state="normal", text="Convert")
        self.progress["value"] = 100


def main():
    root = tk.Tk()
    ConverterGUI(root)
    root.mainloop()


if __name__ == "__main__":
    main()
