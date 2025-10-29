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
from typing import Any
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

# Import the enhanced formatter
from scripts.fix_formatting import MarkdownFormattingFixer

# Optional: direct tool imports for partial runs
from tools import fix_toc_plain


APP_TITLE = "DocWorkbench — Yggsburgh Markdown Tooling"
DEFAULT_SUFFIX = "_pipeline"

class SettingsWindow(tk.Toplevel):
    """A Toplevel window for editing pipeline configuration."""
    def __init__(self, parent):
        super().__init__(parent)
        self.title("Settings")
        self.transient(parent)
        self.geometry("500x400")

        self.config = {}
        self.pyproject_path = REPO_ROOT / 'pyproject.toml'

        # Header settings
        self.max_depth_var = tk.StringVar(value="4")
        self.fix_hierarchy_var = tk.BooleanVar(value=True)
        
        # Formatter settings
        self.enable_break_fixing_var = tk.BooleanVar(value=True)
        self.enable_cleanup_var = tk.BooleanVar(value=True)
        self.fix_merged_words_var = tk.BooleanVar(value=True)
        self.normalize_labels_var = tk.BooleanVar(value=True)
        
        # Other settings
        self.line_threshold_var = tk.StringVar()

        self._build_ui()
        self.load_settings()

    def _build_ui(self):
        frame = ttk.Frame(self, padding=10)
        frame.pack(fill="both", expand=True)

        # Create a canvas with scrollbar
        canvas = tk.Canvas(frame)
        scrollbar = ttk.Scrollbar(frame, orient="vertical", command=canvas.yview)
        scrollable_frame = ttk.Frame(canvas)

        scrollable_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )

        canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)

        # Header Settings
        ttk.Label(scrollable_frame, text="Header Settings", font=('TkDefaultFont', 10, 'bold')).grid(row=0, column=0, sticky="w", pady=(0, 5))
        
        ttk.Label(scrollable_frame, text="Max Header Depth:").grid(row=1, column=0, sticky="w", pady=2)
        ttk.Spinbox(scrollable_frame, from_=1, to=6, width=5, textvariable=self.max_depth_var).grid(row=1, column=1, sticky="w", padx=5)
        
        ttk.Checkbutton(scrollable_frame, text="Fix Header Hierarchy", variable=self.fix_hierarchy_var).grid(row=2, column=0, columnspan=2, sticky="w")
        
        # Formatter Settings
        ttk.Label(scrollable_frame, text="\nFormatter Settings", font=('TkDefaultFont', 10, 'bold')).grid(row=10, column=0, sticky="w", pady=(10, 5))
        
        ttk.Checkbutton(scrollable_frame, text="Enable Break Fixing", variable=self.enable_break_fixing_var).grid(row=11, column=0, columnspan=2, sticky="w")
        ttk.Checkbutton(scrollable_frame, text="Enable Cleanup", variable=self.enable_cleanup_var).grid(row=12, column=0, columnspan=2, sticky="w")
        ttk.Checkbutton(scrollable_frame, text="Fix Merged Words", variable=self.fix_merged_words_var).grid(row=13, column=0, columnspan=2, sticky="w")
        ttk.Checkbutton(scrollable_frame, text="Normalize Special Labels", variable=self.normalize_labels_var).grid(row=14, column=0, columnspan=2, sticky="w")
        
        # Other Settings
        ttk.Label(scrollable_frame, text="\nOther Settings", font=('TkDefaultFont', 10, 'bold')).grid(row=20, column=0, sticky="w", pady=(10, 5))
        
        ttk.Label(scrollable_frame, text="Line Threshold:").grid(row=21, column=0, sticky="w", pady=2)
        ttk.Entry(scrollable_frame, textvariable=self.line_threshold_var, width=10).grid(row=21, column=1, sticky="w", padx=5)
        ttk.Label(scrollable_frame, text="(0 = auto)").grid(row=21, column=2, sticky="w")

        # Buttons
        btn_frame = ttk.Frame(frame)
        btn_frame.pack(fill="x", pady=(10, 0))
        
        ttk.Button(btn_frame, text="Save", command=self.save_settings).pack(side="left", padx=5)
        ttk.Button(btn_frame, text="Cancel", command=self.destroy).pack(side="left", padx=5)
        
        # Pack the canvas and scrollbar
        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

    def load_settings(self):
        if not self.pyproject_path.exists():
            messagebox.showerror("Error", "pyproject.toml not found!", parent=self)
            return

        with open(self.pyproject_path, 'rb') as f:
            self.config = tomllib.load(f)

        pipeline_config = self.config.get('tool', {}).get('book-pipeline', {})
        formatter_config = pipeline_config.get('formatter', {})
        
        # Load header settings
        self.max_depth_var.set(str(formatter_config.get('max_header_depth', 4)))
        self.fix_hierarchy_var.set(formatter_config.get('fix_hierarchy', True))
        
        # Load formatter settings
        self.enable_break_fixing_var.set(formatter_config.get('enable_break_fixing', True))
        self.enable_cleanup_var.set(formatter_config.get('enable_cleanup', True))
        self.fix_merged_words_var.set(formatter_config.get('fix_merged_words', True))
        self.normalize_labels_var.set(formatter_config.get('normalize_labels', True))
        
        # Load other settings
        self.line_threshold_var.set(str(pipeline_config.get('line_length_threshold', 0)))

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

        # Update formatter settings
        formatter_config = {
            'max_header_depth': new_max_depth,
            'fix_hierarchy': self.fix_hierarchy_var.get(),
            'enable_break_fixing': self.enable_break_fixing_var.get(),
            'enable_cleanup': self.enable_cleanup_var.get(),
            'fix_merged_words': self.fix_merged_words_var.get(),
            'normalize_labels': self.normalize_labels_var.get()
        }
        
        self.config['tool']['book-pipeline']['formatter'] = formatter_config
        self.config['tool']['book-pipeline']['line_length_threshold'] = new_threshold

        try:
            with open(self.pyproject_path, 'wb') as f:
                tomli_w.dump(self.config, f)
            messagebox.showinfo("Success", "Settings saved to pyproject.toml", parent=self)
            self.destroy()
        except Exception as e:
            messagebox.showerror("Error", f"Failed to save settings: {e}", parent=self)


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
        # Configure style
        style = ttk.Style()
        style.theme_use('default')
        
        # Color scheme
        colors = {
            'primary': '#4a6da7',
            'secondary': '#6c757d',
            'success': '#28a745',
            'info': '#17a2b8',
            'warning': '#ffc107',
            'danger': '#dc3545',
            'light': '#f8f9fa',
            'dark': '#343a40',
            'bg': '#f0f2f5',
            'text': '#212529',
            'border': '#dee2e6'
        }
        
        # Configure styles
        self.configure(bg=colors['bg'])
        
        style.configure('TFrame', background=colors['bg'])
        style.configure('TLabel', background=colors['bg'], foreground=colors['text'])
        style.configure('TButton', padding=6, font=('Helvetica', 10))
        style.configure('TEntry', padding=4, font=('Helvetica', 10))
        style.configure('TProgressbar', background=colors['info'], troughcolor=colors['border'])
        
        # Primary button style
        style.configure('Primary.TButton', 
                       background=colors['primary'], 
                       foreground='white',
                       font=('Helvetica', 10, 'bold'))
        
        # Secondary button style
        style.configure('Secondary.TButton',
                      background=colors['secondary'],
                      foreground='white')
        
        # Main container
        main_frame = ttk.Frame(self, padding=(12, 12, 12, 12), style='TFrame')
        main_frame.pack(fill='both', expand=True)
        
        # Header section
        header = ttk.LabelFrame(main_frame, text=" Document Processor ", padding=(12, 8, 12, 12))
        header.pack(fill='x', pady=(0, 12))
        
        # Input group
        input_frame = ttk.Frame(header)
        input_frame.pack(fill='x', pady=4)
        
        ttk.Label(input_frame, text="Input File:", font=('Helvetica', 10, 'bold')).pack(side='left', padx=(0, 8))
        
        self.input_entry = ttk.Entry(input_frame, width=60)
        self.input_entry.pack(side='left', fill='x', expand=True, padx=(0, 8))
        
        ttk.Button(input_frame, text="Browse…", command=self.pick_input, style='Secondary.TButton')\
             .pack(side='left', padx=(0, 12))
        
        # Options group
        options_frame = ttk.Frame(header)
        options_frame.pack(fill='x', pady=8)
        
        ttk.Label(options_frame, text="Output Suffix:").pack(side='left', padx=(0, 4))
        ttk.Entry(options_frame, width=16, textvariable=self.out_suffix_var, 
                 font=('Monospace', 10)).pack(side='left', padx=(0, 12))
        
        ttk.Checkbutton(options_frame, text="Inline Tables (TSV)", 
                       variable=self.inline_tables_var).pack(side='left', padx=12)
        
        # Action buttons
        actions_frame = ttk.Frame(main_frame)
        actions_frame.pack(fill='x', pady=(0, 12))
        
        # Left action buttons
        left_actions = ttk.Frame(actions_frame)
        left_actions.pack(side='left', fill='x', expand=True)
        
        ttk.Button(left_actions, text="🔄 Run FULL Pipeline", 
                 command=self.run_full_pipeline, style='Primary.TButton').pack(side='left', padx=(0, 8))
        
        ttk.Button(left_actions, text="✏️  Format Text", 
                 command=self.quick_format, style='Secondary.TButton').pack(side='left', padx=8)
        
        ttk.Button(left_actions, text="📑 Fix TOC", 
                 command=self.quick_fix_toc, style='Secondary.TButton').pack(side='left', padx=8)
        
        # Right action buttons
        right_actions = ttk.Frame(actions_frame)
        right_actions.pack(side='right')
        
        ttk.Button(right_actions, text="⚙️ Settings", 
                 command=self.open_settings, style='Secondary.TButton').pack(side='right', padx=4)
        
        ttk.Button(right_actions, text="📂 Open Output", 
                 command=self.open_output_folder, style='Secondary.TButton').pack(side='right', padx=4)
        
        # Status bar
        status_frame = ttk.Frame(main_frame, height=28)
        status_frame.pack(fill='x', pady=(0, 8))
        
        self.progress = ttk.Progressbar(status_frame, mode='indeterminate', style='TProgressbar')
        self.progress.pack(side='left', fill='x', expand=True, padx=(0, 8))
        
        self.status_label = ttk.Label(status_frame, text="Ready", 
                                    foreground=colors['secondary'],
                                    font=('Helvetica', 9, 'italic'))
        self.status_label.pack(side='right')
        
        # Main content area
        content_frame = ttk.Frame(main_frame)
        content_frame.pack(fill='both', expand=True)
        
        # Log panel
        log_frame = ttk.LabelFrame(content_frame, text=" Processing Log ", padding=8)
        log_frame.pack(side='left', fill='both', expand=True, padx=(0, 8))
        
        self.log = ScrolledText(log_frame, wrap='word', font=('Menlo', 10), 
                              bg='#ffffff', fg=colors['text'],
                              borderwidth=1, relief='solid')
        self.log.pack(fill='both', expand=True)
        
        # Detail panel
        paned = ttk.PanedWindow(content_frame, orient="horizontal")
        paned.pack(fill="both", expand=True)

        left = ttk.Frame(paned)
        paned.add(left, weight=1)

        right = ttk.Frame(paned)
        paned.add(right, weight=1)

        self.detail_notebook = ttk.Notebook(right)
        self.detail_notebook.pack(fill="both", expand=True)

        self.preview_tab = ttk.Frame(self.detail_notebook)
        self.summary_tab = ttk.Frame(self.detail_notebook)
        self.detail_notebook.add(self.preview_tab, text="Preview")
        self.detail_notebook.add(self.summary_tab, text="Summary")

        self.preview = ScrolledText(self.preview_tab, wrap='word', font=('Menlo', 10),
                                    state='disabled', bg='#ffffff', fg=colors['text'],
                                    borderwidth=1, relief='solid')
        self.preview.pack(fill='both', expand=True, padx=4, pady=4)

        self.summary = ScrolledText(self.summary_tab, height=10, state="disabled")
        self.summary.configure(font=("Menlo", 11) if sys.platform == "darwin" else ("Consolas", 10))
        self.summary.pack(fill="both", expand=True, padx=4, pady=4)
        
        # Footer
        footer = ttk.Frame(main_frame, height=24)
        footer.pack(fill='x', pady=(8, 0))
        
        ttk.Label(footer, text="DocWorkbench v1.0 • Press F1 for help", 
                 foreground=colors['secondary'],
                 font=('Helvetica', 8)).pack(side='right')
        
        # Bind F1 key for help
        self.bind('<F1>', lambda e: self.show_help())

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
        try:
            text = self.input_md.read_text(encoding="utf-8")
        except Exception as exc:
            messagebox.showerror("Preview error", f"Could not read file: {exc}")
            return
        self._set_preview(text)

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

    def _set_preview(self, text: str):
        self.preview.config(state="normal")
        self.preview.delete("1.0", "end")
        self.preview.insert("end", text)
        self.preview.config(state="disabled")
        self.detail_notebook.select(self.preview_tab)

    def _set_summary(self, obj: dict | str):
        self.summary.config(state="normal")
        self.summary.delete("1.0", "end")
        if isinstance(obj, str):
            self.summary.insert("end", obj)
        else:
            self.summary.insert("end", json.dumps(obj, indent=2))
        self.summary.config(state="disabled")
        self.detail_notebook.select(self.summary_tab)

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

    def quick_format(self):
        input_md = self._validate_input()
        if not input_md:
            return

        def worker():
            try:
                self._log(f"Running formatter on: {input_md.name}")
                content = input_md.read_text(encoding="utf-8")

                pipeline_config = load_config()
                formatter_config: dict[str, Any] = {}
                if isinstance(pipeline_config, dict):
                    formatter_config = pipeline_config.get('formatter', {}) or {}

                formatter = MarkdownFormattingFixer(config=formatter_config)
                fixed_content = formatter.fix_content(content)

                out_path = input_md.with_name(f"{input_md.stem}_formatted.md")
                out_path.write_text(fixed_content, encoding="utf-8")

                change_count = len(formatter.changes)
                summary_payload = {
                    "quick": "formatter",
                    "output": str(out_path),
                    "changes": change_count,
                    "config": formatter_config,
                }
                self.last_summary = summary_payload
                self._log(f"Formatter wrote {out_path.name} ({change_count} changes)")
                self._set_summary(summary_payload)
                self._stop_busy("Formatting complete")
            except Exception as e:
                self._stop_busy("Error")
                messagebox.showerror("Formatter error", str(e))
                self._log(f"ERROR: {e}")

        self._start_busy("Running formatter…")
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

    def show_help(self):
        messagebox.showinfo(
            "DocWorkbench Help",
            "Select an input Markdown file, then choose a quick fix or run the full pipeline.\n\n"
            "Use the Settings panel (⚙️) to configure formatter options that are saved in pyproject.toml."
        )


def main():
    app = DocWorkbenchApp()
    app.mainloop()


if __name__ == "__main__":
    main()