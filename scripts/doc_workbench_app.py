#!/usr/bin/env python3
"""
DocWorkbenchApp
A lightweight Tkinter GUI for the TLG/Yggsburgh markdown cleanup pipeline.

- Lets you pick an input .md
- Run the full pipeline or individual quick fixes
- Shows live logs and summary
- Opens output folder or reports folder with one click
- Non-blocking: pipeline runs in a worker thread

Place this file at: scripts/doc_workbench_app.py
Run: python3 scripts/doc_workbench_app.py
"""

import os
import sys
import json
import threading
from pathlib import Path
from datetime import datetime
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from tkinter.scrolledtext import ScrolledText
import webbrowser
import subprocess

# --- Repo path so we can import local modules ---
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

import tomli_w
try:
    import tomllib
except ImportError:
    import tomli as tomllib

# Import the pipeline and tools
from scripts.book_pipeline import pipeline as run_pipeline_func, load_config
from scripts.book_pipeline import REPORTS_DIR as PIPE_REPORTS_DIR

# Optional: direct tool imports for partial runs
from tools import fix_toc_plain
from tools import advanced_break_fixer


APP_TITLE = "DocWorkbench — Yggsburgh Markdown Tooling"
DEFAULT_SUFFIX = "_pipeline"

class SettingsWindow(tk.Toplevel):
    """A Toplevel window for editing pipeline configuration."""
    def __init__(self, parent):
        super().__init__(parent)
        self.title("Settings")
        self.transient(parent)
        self.geometry("500x200")

        self.config = {}
        self.pyproject_path = REPO_ROOT / 'pyproject.toml'

        self.max_depth_var = tk.StringVar()
        self.line_threshold_var = tk.StringVar()

        self._build_ui()
        self.load_settings()

    def _build_ui(self):
        frame = ttk.Frame(self, padding=10)
        frame.pack(fill="both", expand=True)

        ttk.Label(frame, text="Max Header Depth:").grid(row=0, column=0, sticky="w", pady=5)
        ttk.Entry(frame, textvariable=self.max_depth_var).grid(row=0, column=1, sticky="ew")

        ttk.Label(frame, text="Long Line Threshold:").grid(row=1, column=0, sticky="w", pady=5)
        ttk.Entry(frame, textvariable=self.line_threshold_var).grid(row=1, column=1, sticky="ew")

        frame.columnconfigure(1, weight=1)

        btn_frame = ttk.Frame(self, padding=10)
        btn_frame.pack(fill="x", side="bottom")
        ttk.Button(btn_frame, text="Save", command=self.save_settings).pack(side="right", padx=5)
        ttk.Button(btn_frame, text="Cancel", command=self.destroy).pack(side="right")

    def load_settings(self):
        if not self.pyproject_path.exists():
            messagebox.showerror("Error", "pyproject.toml not found!", parent=self)
            return

        with open(self.pyproject_path, 'rb') as f:
            self.config = tomllib.load(f)

        pipeline_config = self.config.get('tool', {}).get('book-pipeline', {})
        self.max_depth_var.set(str(pipeline_config.get('max_header_depth', 4)))
        self.line_threshold_var.set(str(pipeline_config.get('long_line_threshold', 150)))

    def save_settings(self):
        try:
            new_max_depth = int(self.max_depth_var.get())
            new_threshold = int(self.line_threshold_var.get())
        except ValueError:
            messagebox.showerror("Invalid Input", "Please enter valid integers.", parent=self)
            return

        if 'tool' not in self.config:
            self.config['tool'] = {}
        if 'book-pipeline' not in self.config['tool']:
            self.config['tool']['book-pipeline'] = {}

        self.config['tool']['book-pipeline']['max_header_depth'] = new_max_depth
        self.config['tool']['book-pipeline']['long_line_threshold'] = new_threshold

        try:
            with open(self.pyproject_path, 'wb') as f:
                tomli_w.dump(self.config, f)
            messagebox.showinfo("Success", "Settings saved to pyproject.toml.", parent=self)
            self.destroy()
        except Exception as e:
            messagebox.showerror("Error Saving", f"Could not save settings: {e}", parent=self)


class DocWorkbenchApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(APP_TITLE)
        self.geometry("1080x720")
        self.minsize(920, 600)

        self.input_md: Path | None = None
        self.out_suffix_var = tk.StringVar(value=DEFAULT_SUFFIX)
        self.inline_tables_var = tk.BooleanVar(value=False)

        self.last_summary: dict | None = None
        self._build_ui()

    # ---------------- UI ----------------
    def _build_ui(self):
        root = ttk.Frame(self, padding=8)
        root.pack(fill="both", expand=True)

        # Top controls
        top = ttk.Frame(root)
        top.pack(fill="x")

        ttk.Label(top, text="Input .md:").pack(side="left")
        self.input_entry = ttk.Entry(top)
        self.input_entry.pack(side="left", fill="x", expand=True, padx=(6, 6))
        ttk.Button(top, text="Browse…", command=self.pick_input).pack(side="left", padx=(0, 6))
        ttk.Label(top, text="Suffix:").pack(side="left")
        ttk.Entry(top, width=16, textvariable=self.out_suffix_var).pack(side="left", padx=(6, 6))
        ttk.Checkbutton(top, text="Inline tables (TSV) [TABLES_INLINE=1]", variable=self.inline_tables_var).pack(side="left")

        # Action buttons
        actions = ttk.Frame(root)
        actions.pack(fill="x", pady=(8, 8))
        ttk.Button(actions, text="Run FULL Pipeline", command=self.run_full_pipeline).pack(side="left", padx=(0, 6))
        ttk.Button(actions, text="Quick Fix: Paragraphs", command=self.quick_advanced_break_fix).pack(side="left", padx=6)
        ttk.Button(actions, text="Quick Fix: Normalize TOC", command=self.quick_fix_toc).pack(side="left", padx=6)

        btn_right_frame = ttk.Frame(actions)
        btn_right_frame.pack(side="right")
        ttk.Button(btn_right_frame, text="Settings…", command=self.open_settings).pack(side="right")
        ttk.Button(btn_right_frame, text="Open Reports Folder", command=self.open_reports_folder).pack(side="right", padx=6)
        ttk.Button(btn_right_frame, text="Open Output Folder", command=self.open_output_folder).pack(side="right", padx=6)

        # Progress + status
        status = ttk.Frame(root)
        status.pack(fill="x")
        self.progress = ttk.Progressbar(status, mode="indeterminate")
        self.progress.pack(side="left", fill="x", expand=True, padx=(0, 8))
        self.status_label = ttk.Label(status, text="Idle")
        self.status_label.pack(side="right")

        # Log + summary
        paned = ttk.Panedwindow(root, orient="horizontal")
        paned.pack(fill="both", expand=True)

        self.log = ScrolledText(paned, height=10)
        self.log.configure(font=("Menlo", 11) if sys.platform == "darwin" else ("Consolas", 10))
        paned.add(self.log, weight=2)

        right = ttk.Frame(paned)
        paned.add(right, weight=1)

        ttk.Label(right, text="Summary").pack(anchor="w")
        self.summary = ScrolledText(right, height=10, state="disabled")
        self.summary.configure(font=("Menlo", 11) if sys.platform == "darwin" else ("Consolas", 10))
        self.summary.pack(fill="both", expand=True)

        # Footer
        footer = ttk.Frame(root)
        footer.pack(fill="x")
        ttk.Label(footer, text="Use FULL Pipeline for a complete, versioned run with reports.").pack(anchor="w")

    # ---------------- Helpers ----------------
    def pick_input(self):
        path = filedialog.askopenfilename(
            title="Choose Markdown file",
            filetypes=[("Markdown", "*.md"), ("All files", "*.*")]
        )
        if not path:
            return
        self.input_md = Path(path)
        self.input_entry.delete(0, "end")
        self.input_entry.insert(0, str(self.input_md))

    def _start_busy(self, msg="Working…"):
        self.progress.start(10)
        self.status_label.config(text=msg)
        self._log(f"\n[{datetime.now().strftime('%H:%M:%S')}] {msg}")

    def _stop_busy(self, msg="Done"):
        self.progress.stop()
        self.status_label.config(text=msg)
        self._log(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}\n")

    def _log(self, text: str):
        self.log.insert("end", text + ("\n" if not text.endswith("\n") else ""))
        self.log.see("end")

    def _set_summary(self, obj: dict | str):
        self.summary.config(state="normal")
        self.summary.delete("1.0", "end")
        if isinstance(obj, str):
            self.summary.insert("end", obj)
        else:
            self.summary.insert("end", json.dumps(obj, indent=2))
        self.summary.config(state="disabled")

    def _validate_input(self) -> Path | None:
        # Allow manual typing
        text = self.input_entry.get().strip()
        if text:
            self.input_md = Path(text)
        if not self.input_md or not self.input_md.exists():
            messagebox.showerror("No input", "Please choose a valid input .md file.")
            return None
        return self.input_md

    def _open_path(self, path: Path):
        try:
            if sys.platform == "darwin":
                subprocess.run(["open", str(path)])
            elif sys.platform.startswith("win"):
                os.startfile(str(path))  # type: ignore
            else:
                subprocess.run(["xdg-open", str(path)])
        except Exception:
            # Fallback to browser if folder
            webbrowser.open(str(path))

    # ---------------- Actions ----------------
    def run_full_pipeline(self):
        input_md = self._validate_input()
        if not input_md: return

        def worker():
            try:
                self._log(f"Running full pipeline on: {input_md.name}")
                config = load_config()
                summary = run_pipeline_func(input_md, config=config)
                self.last_summary = summary
                self._set_summary(summary)
                self._log(f"Final output: {summary.get('final_output')}")
                self._log("Steps:\n" + "\n".join(f"  - {s.get('step')}" for s in summary.get("steps", [])))
                self._stop_busy("Pipeline complete")
            except Exception as e:
                self._stop_busy("Error")
                messagebox.showerror("Pipeline error", str(e))
                self._log(f"ERROR: {e}")

        self._start_busy("Running full pipeline…")
        threading.Thread(target=worker, daemon=True).start()

    def quick_fix_toc(self):
        input_md = self._validate_input()
        if not input_md:
            return

        def worker():
            try:
                text = input_md.read_text(encoding="utf-8")
                fixed, changes = fix_toc_plain.fix_toc_plain(text)
                out = input_md.with_name(f"{input_md.stem}_quicktoc.md")
                out.write_text(fixed, encoding="utf-8")
                self._log(f"TOC changes: {changes} -> {out.name}")
                self._set_summary({"quick": "fix_toc_plain", "changes": int(changes), "output": str(out)})
                self._stop_busy("TOC normalized")
            except Exception as e:
                self._stop_busy("Error")
                messagebox.showerror("TOC error", str(e))
                self._log(f"ERROR: {e}")

        self._start_busy("Normalizing TOC…")
        threading.Thread(target=worker, daemon=True).start()

    def quick_advanced_break_fix(self):
        input_md = self._validate_input()
        if not input_md:
            return

        def worker():
            try:
                content = input_md.read_text(encoding="utf-8")
                self._log(f"Running advanced break fixer on: {input_md.name}")
                fixed, fixes_made = advanced_break_fixer.fix_mid_word_breaks(content)
                # Apply hyphenated word splits fix
                hyphen_fixes, hyphen_fixes_made = advanced_break_fixer.fix_hyphenated_word_splits(fixed)
                # Apply sentence blank line splits fix
                blank_line_fixes, blank_line_fixes_made = advanced_break_fixer.fix_sentence_blank_line_splits(hyphen_fixes)
                total_fixes = fixes_made + hyphen_fixes_made + blank_line_fixes_made
                out_path = input_md.with_name(f"{input_md.stem}_quick_paras.md")
                out_path.write_text(blank_line_fixes, encoding="utf-8")
                self._log(f"Advanced break fixes written to {out_path.name}")
                self._set_summary({
                    "quick": "advanced_break_fixer",
                    "output": str(out_path),
                    "fixes": total_fixes,
                    "mid_word_fixes": fixes_made,
                    "hyphen_fixes": hyphen_fixes_made,
                    "blank_line_fixes": blank_line_fixes_made
                })
                self._stop_busy(f"Advanced break fix complete ({total_fixes} fixes)")
            except Exception as e:
                self._stop_busy("Error")
                messagebox.showerror("Advanced Break Fix error", str(e))
                self._log(f"ERROR: {e}")

        self._start_busy("Fixing paragraphs…")
        threading.Thread(target=worker, daemon=True).start()

    def open_settings(self):
        SettingsWindow(self)

    def open_output_folder(self):
        if self.last_summary and "final_output" in self.last_summary:
            out_path = Path(self.last_summary["final_output"]).resolve()
            self._open_path(out_path.parent)
        elif self.input_md:
            self._open_path(self.input_md.parent)
        else:
            messagebox.showinfo("Open folder", "Run a pipeline first, or choose an input so I know where to open.")

    def open_reports_folder(self):
        self._open_path(PIPE_REPORTS_DIR)


def main():
    app = DocWorkbenchApp()
    app.mainloop()


if __name__ == "__main__":
    main()