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
import re
from typing import Any, Dict, List, Tuple
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
from tools.image_reference_remover import remove_image_references
from tools.blockquote_remover import BlockquoteRemover
from tools.remove_isolated_page_numbers import remove_isolated_page_numbers
from tools import fix_table_formatting
from tools.fix_ocr_errors import fix_ocr_errors
from tools.fix_additional_ocr_errors import fix_additional_ocr_errors
from tools.long_line_detector import LongLineDetector
from tools.markdown_validator import MarkdownValidator
from tools.spell_check import SpellChecker
from tools.paragraph_break_detector import ParagraphBreakDetector

# Optional dependencies for rendered preview
try:
    import markdown as md_lib  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    md_lib = None

try:
    from tkhtmlview import HTMLScrolledText  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    HTMLScrolledText = None


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


TOOL_DEFINITIONS: List[Dict[str, Any]] = [
    {
        "key": "fix_toc_plain",
        "label": "Fix TOC",
        "category": "Formatting & Cleanup",
        "description": "Normalize the Table of Contents block.",
        "mutates": True,
    },
    {
        "key": "remove_images",
        "label": "Remove Images",
        "category": "Formatting & Cleanup",
        "description": "Strip Markdown image references.",
        "mutates": True,
    },
    {
        "key": "remove_blockquotes",
        "label": "Remove Blockquotes",
        "category": "Formatting & Cleanup",
        "description": "Drop stray blockquote markers (>)",
        "mutates": True,
    },
    {
        "key": "remove_page_numbers",
        "label": "Remove Page Numbers",
        "category": "Formatting & Cleanup",
        "description": "Remove isolated page numbers from converted text.",
        "mutates": True,
    },
    {
        "key": "markdown_formatting",
        "label": "Markdown Formatting",
        "category": "Formatting & Cleanup",
        "description": "Run the consolidated Markdown formatter.",
        "mutates": True,
    },
    {
        "key": "fix_long_lines",
        "label": "Fix Long Lines",
        "category": "Formatting & Cleanup",
        "description": "Break overly long lines into paragraphs using detector heuristics.",
        "mutates": True,
    },
    {
        "key": "fix_tables",
        "label": "Fix Tables",
        "category": "Formatting & Cleanup",
        "description": "Clean Markdown tables using the table formatter.",
        "mutates": True,
    },
    {
        "key": "fix_ocr_base",
        "label": "Fix OCR (Base)",
        "category": "OCR Fixes",
        "description": "Apply the baseline OCR correction map.",
        "mutates": True,
    },
    {
        "key": "fix_ocr_additional",
        "label": "Fix OCR (Additional)",
        "category": "OCR Fixes",
        "description": "Apply the additional OCR corrections and overrides.",
        "mutates": True,
    },
    {
        "key": "spell_check",
        "label": "Spell Check (Report)",
        "category": "Quality Control",
        "description": "Generate a potential misspelling report (no changes).",
        "mutates": False,
    },
    {
        "key": "long_line_detector",
        "label": "Long Line Detector (Report)",
        "category": "Quality Control",
        "description": "Report lines exceeding the configured threshold.",
        "mutates": False,
    },
    {
        "key": "paragraph_break_detector",
        "label": "Paragraph Break Detector (Report)",
        "category": "Quality Control",
        "description": "Report likely paragraph break artifacts.",
        "mutates": False,
    },
    {
        "key": "final_validation",
        "label": "Final Validation",
        "category": "Quality Control",
        "description": "Run Markdown structural validation checks.",
        "mutates": False,
    },
]


class QuickToolDialog(tk.Toplevel):
    """Dialog for selecting quick tools and scope."""

    def __init__(self, parent: tk.Tk, tools: List[Dict[str, Any]], selection_available: bool):
        super().__init__(parent)
        self.title("Quick Tools")
        self.transient(parent)
        self.grab_set()

        self._tools = tools
        self._selection_available = selection_available
        self.result: Dict[str, Any] | None = None

        self.scope_var = tk.StringVar(value="selection" if selection_available else "document")
        self.tool_vars: Dict[str, tk.BooleanVar] = {}

        container = ttk.Frame(self, padding=12)
        container.pack(fill="both", expand=True)

        ttk.Label(container, text="Select one or more tools to run:", font=('Helvetica', 11, 'bold')).pack(anchor="w")

        categories: Dict[str, List[Dict[str, Any]]] = {}
        for tool in tools:
            categories.setdefault(tool["category"], []).append(tool)

        tools_frame = ttk.Frame(container)
        tools_frame.pack(fill="both", expand=True, pady=(8, 12))

        for category, items in categories.items():
            cat_frame = ttk.LabelFrame(tools_frame, text=f" {category} ")
            cat_frame.pack(fill="x", expand=True, pady=4)
            for tool in items:
                var = tk.BooleanVar(value=False)
                self.tool_vars[tool["key"]] = var
                chk = ttk.Checkbutton(cat_frame, text=tool["label"], variable=var)
                chk.pack(anchor="w", padx=8, pady=2)
                if tool.get("description"):
                    ttk.Label(cat_frame, text=f"↳ {tool['description']}", style='ToolDescription.TLabel').pack(anchor="w", padx=24)

        scope_frame = ttk.LabelFrame(container, text=" Scope ")
        scope_frame.pack(fill="x", pady=(0, 12))
        ttk.Radiobutton(scope_frame, text="Apply to selection", value="selection", variable=self.scope_var,
                        state='normal' if selection_available else 'disabled').pack(anchor="w", padx=8, pady=2)
        ttk.Radiobutton(scope_frame, text="Apply to entire document", value="document", variable=self.scope_var).pack(anchor="w", padx=8, pady=2)

        btn_frame = ttk.Frame(container)
        btn_frame.pack(fill="x")
        ttk.Button(btn_frame, text="Run", command=self._on_run, style='Primary.TButton').pack(side="right")
        ttk.Button(btn_frame, text="Cancel", command=self.destroy).pack(side="right", padx=(0, 8))

        self.bind("<Return>", lambda *_: self._on_run())
        self.bind("<Escape>", lambda *_: self.destroy())

    def _on_run(self):
        selected = [key for key, var in self.tool_vars.items() if var.get()]
        if not selected:
            messagebox.showwarning("No tools selected", "Choose at least one tool to run.", parent=self)
            return
        scope = self.scope_var.get()
        if scope == "selection" and not self._selection_available:
            messagebox.showwarning("No selection", "No text selection detected. Choose the entire document or select text first.", parent=self)
            return
        self.result = {"tools": selected, "scope": scope}
        self.destroy()

class DocWorkbenchApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(APP_TITLE)
        self.geometry("1080x720")
        self.minsize(920, 600)

        self.input_md: Path | None = None
        self.out_suffix_var = tk.StringVar(value=DEFAULT_SUFFIX)
        self.inline_tables_var = tk.BooleanVar(value=False)

        self.current_content: str = ""
        self._render_anchor_map: Dict[str, str] = {}
        self._render_anchor_tag = "md_link"
        self.change_log_entries: List[str] = []
        self._pipeline_config_cache: Dict[str, Any] | None = None

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
        
        ttk.Button(left_actions, text="🛠 Quick Tools…", 
                 command=self.open_quick_tools, style='Secondary.TButton').pack(side='left', padx=8)
        
        ttk.Button(left_actions, text="📑 Fix TOC", 
                 command=self.quick_fix_toc, style='Secondary.TButton').pack(side='left', padx=8)

    # Edmunds Tagging Button
    ttk.Button(left_actions, text="🏷 Inject Edmunds Tags", 
         command=self.inject_edmunds_tags, style='Secondary.TButton').pack(side='left', padx=8)
    def inject_edmunds_tags(self):
        from tkinter import filedialog, messagebox
        import subprocess
        # Prompt for input file
        input_path = filedialog.askopenfilename(
            title="Select Markdown file to tag",
            filetypes=[("Markdown files", "*.md"), ("All files", "*.*")]
        )
        if not input_path:
            return
        # Prompt for output file
        output_path = filedialog.asksaveasfilename(
            title="Save tagged output as",
            defaultextension=".md",
            filetypes=[("Markdown files", "*.md"), ("All files", "*.*")]
        )
        if not output_path:
            return
        self.log.insert('end', f"[Edmunds] Tagging: {input_path} → {output_path}\n")
        self.log.see('end')
        try:
            result = subprocess.run([
                sys.executable, "scripts/inject_numeric_tags.py",
                input_path, "-o", output_path
            ], capture_output=True, text=True)
            if result.returncode == 0:
                self.log.insert('end', f"[Edmunds] Success! Output: {output_path}\n")
                messagebox.showinfo("Edmunds Tagging", f"Tagging complete!\nOutput: {output_path}")
            else:
                self.log.insert('end', f"[Edmunds] Error: {result.stderr}\n")
                messagebox.showerror("Edmunds Tagging Failed", result.stderr)
        except Exception as e:
            self.log.insert('end', f"[Edmunds] Exception: {e}\n")
            messagebox.showerror("Edmunds Tagging Exception", str(e))
        self.log.see('end')
        
        # Right action buttons
        right_actions = ttk.Frame(actions_frame)
        right_actions.pack(side='right')
        
        ttk.Button(right_actions, text="⚙️ Settings", 
                 command=self.open_settings, style='Secondary.TButton').pack(side='right', padx=4)
        
        ttk.Button(right_actions, text="⬇️ Export Markdown", 
                 command=self.export_markdown, style='Secondary.TButton').pack(side='right', padx=4)
        
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
        self.render_tab = ttk.Frame(self.detail_notebook)
        self.summary_tab = ttk.Frame(self.detail_notebook)
        self.log_tab = ttk.Frame(self.detail_notebook)
        self.detail_notebook.add(self.preview_tab, text="Preview")
        self.detail_notebook.add(self.render_tab, text="Rendered")
        self.detail_notebook.add(self.summary_tab, text="Summary")
        self.detail_notebook.add(self.log_tab, text="Log")

        self.preview = ScrolledText(self.preview_tab, wrap='word', font=('Menlo', 10),
                                    state='disabled', bg='#ffffff', fg=colors['text'],
                                    borderwidth=1, relief='solid')
        self.preview.pack(fill='both', expand=True, padx=4, pady=4)

        if HTMLScrolledText is not None:
            self.rendered = HTMLScrolledText(self.render_tab, html="")
        else:
            self.rendered = ScrolledText(self.render_tab, wrap='word', font=('Menlo', 10),
                                         state='normal', bg='#f8f9fa', fg=colors['text'],
                                         borderwidth=1, relief='solid')
        self.rendered.pack(fill='both', expand=True, padx=4, pady=4)
        self._configure_rendered_widget()

        self.summary = ScrolledText(self.summary_tab, height=10, state="disabled")
        self.summary.configure(font=("Menlo", 11) if sys.platform == "darwin" else ("Consolas", 10))
        self.summary.pack(fill="both", expand=True, padx=4, pady=4)

        self.change_log_view = ScrolledText(self.log_tab, height=10, state="disabled")
        self.change_log_view.configure(font=("Menlo", 11) if sys.platform == "darwin" else ("Consolas", 10))
        self.change_log_view.pack(fill="both", expand=True, padx=4, pady=4)
        
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
        self._update_rendered_preview(text)
        self.current_content = text

    def _update_rendered_preview(self, text: str):
        if HTMLScrolledText is not None and hasattr(self.rendered, "set_html"):
            if md_lib is None:
                self.rendered.set_html("<p><strong>Markdown package not installed.</strong><br>"
                                       "Run <code>pip install markdown tkhtmlview</code> inside the venv "
                                       "to enable rendered preview.</p>")
                return
            try:
                self._render_anchor_map = self._build_anchor_index_map(text)
                html = md_lib.markdown(text, extensions=["extra", "tables", "toc"])
                html = self._inject_anchor_spans(html)
            except Exception as exc:
                self.rendered.set_html(f"<p><strong>Markdown render error:</strong> {exc}</p>")
                self._render_anchor_map = {}
                return
            self.rendered.set_html(html)
            self.rendered.config(state="normal")
            self.rendered.tag_config(self._render_anchor_tag, foreground="#105eb5", underline=True)
            self.rendered.tag_bind(self._render_anchor_tag, "<Button-1>", self._on_render_link_click)
        else:
            # Fallback: plain text notice
            self.rendered.delete("1.0", "end")
            self.rendered.insert("end",
                                  "Install 'markdown' and 'tkhtmlview' in the virtualenv to see a rendered preview.\n"
                                  "Command: pip install markdown tkhtmlview")
            self._render_anchor_map = {}
        self.rendered.see("1.0")

    def _build_anchor_index_map(self, text: str) -> Dict[str, str]:
        anchors: Dict[str, str] = {}
        lines = text.splitlines()
        offset = 1
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("#"):
                level = len(stripped) - len(stripped.lstrip("#"))
                heading = stripped[level:].strip()
                if heading:
                    anchor = self._slugify_anchor(heading)
                    anchors[anchor] = f"{offset}.0"
            offset += 1
        return anchors

    def _slugify_anchor(self, heading: str) -> str:
        slug = re.sub(r"[^\w\s-]", "", heading).strip().lower()
        slug = re.sub(r"[\s-]+", "-", slug)
        return slug

    def _inject_anchor_spans(self, html: str) -> str:
        if not self._render_anchor_map:
            return html

        def repl(match: re.Match[str]) -> str:
            href = match.group(1)
            display = match.group(2)
            if href.startswith("#"):
                anchor = href[1:]
                if anchor in self._render_anchor_map:
                    return f"<span class=\"doc-link\" data-anchor=\"{anchor}\">{display}</span>"
            return match.group(0)

        return re.sub(r"<a[^>]*href=\"([^\"]+)\"[^>]*>(.*?)</a>", repl, html, flags=re.IGNORECASE)

    def _on_render_link_click(self, event: tk.Event):
        if not isinstance(event.widget, tk.Text):
            return "break"

        index = event.widget.index(f"@{event.x},{event.y}")
        tags = event.widget.tag_names(index)
        for tag in tags:
            if tag.startswith("data-anchor:"):
                anchor = tag.split(":", 1)[1]
                target_index = self._render_anchor_map.get(anchor)
                if target_index:
                    self.preview.see(target_index)
                    self.preview.config(state="normal")
                    self.preview.tag_remove("sel", "1.0", "end")
                    line = target_index.split(".")[0]
                    self.preview.tag_add("sel", f"{line}.0", f"{line}.end")
                    self.preview.config(state="disabled")
                    self.detail_notebook.select(self.preview_tab)
                return "break"
        return "break"

    def _append_change_log(self, message: str):
        timestamp = datetime.now().strftime('%H:%M:%S')
        entry = f"[{timestamp}] {message}"
        self.change_log_entries.append(entry)
        self.change_log_view.config(state="normal")
        self.change_log_view.insert("end", entry + "\n")
        self.change_log_view.config(state="disabled")
        self.change_log_view.see("end")

    def _get_pipeline_config(self) -> Dict[str, Any]:
        if self._pipeline_config_cache is None:
            config = load_config() or {}
            if not isinstance(config, dict):
                config = {}
            self._pipeline_config_cache = config
        return self._pipeline_config_cache

    def _get_selection_text(self) -> Tuple[str | None, Tuple[str, str] | None]:
        # Try preview text widget (read-only)
        text_widget: ScrolledText = self.preview
        if text_widget.tag_ranges("sel"):
            start = text_widget.index("sel.first")
            end = text_widget.index("sel.last")
            return text_widget.get(start, end), (start, end)

        # Fallback to rendered (if text widget)
        if isinstance(self.rendered, ScrolledText) and self.rendered.tag_ranges("sel"):
            start = self.rendered.index("sel.first")
            end = self.rendered.index("sel.last")
            return self.rendered.get(start, end), None

        return None, None

    def _replace_selection_text(self, replacement: str, indices: Tuple[str, str]) -> None:
        start, end = indices
        self.preview.config(state="normal")
        self.preview.delete(start, end)
        self.preview.insert(start, replacement)
        self.preview.config(state="disabled")
        self.current_content = self.preview.get("1.0", "end-1c")
        self._update_rendered_preview(self.current_content)

    def _configure_rendered_widget(self):
        nav_keys = {"Left", "Right", "Up", "Down", "Home", "End", "Prior", "Next"}

        def block_edit(event: tk.Event) -> str | None:
            # Allow navigation keys
            if event.keysym in nav_keys or event.keysym == "Tab":
                return None

            # Allow copy/select all shortcuts (Command on macOS / Control elsewhere)
            if (event.state & 0x4) and event.keysym.lower() in {"a", "c"}:
                return None

            # Allow Command+C on macOS (Mod2)
            if (event.state & 0x0008) and event.keysym.lower() == "c":
                return None

            # Block all other keypresses to keep read-only
            return "break"

        self.rendered.bind("<Key>", block_edit)
        self.rendered.bind("<Button-1>", lambda e: self.rendered.focus_set())
        # Block paste/cut explicitly
        for sequence in ("<<Paste>>", "<Control-v>", "<Command-v>", "<Control-x>", "<Command-x>"):
            self.rendered.bind(sequence, lambda e: "break")

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

    def export_markdown(self):
        if not self.current_content:
            messagebox.showwarning("No content", "Load a document before exporting.")
            return

        default_name = "exported.md"
        if self.input_md:
            default_name = f"{self.input_md.stem}_final.md"

        path = filedialog.asksaveasfilename(
            title="Export Markdown",
            defaultextension=".md",
            filetypes=(("Markdown", "*.md"), ("All files", "*.*")),
            initialfile=default_name
        )
        if not path:
            return

        try:
            Path(path).write_text(self.current_content, encoding="utf-8")
        except Exception as exc:
            messagebox.showerror("Export failed", f"Could not write file:\n{exc}")
            return

        self._append_change_log(f"Exported markdown to {path}")
        messagebox.showinfo("Export complete", f"Markdown saved to:\n{path}")

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

    def open_quick_tools(self):
        selected_text, selection_indices = self._get_selection_text()
        selection_available = selected_text is not None and selected_text.strip() != ""

        dialog = QuickToolDialog(self, TOOL_DEFINITIONS, selection_available)
        self.wait_window(dialog)
        result = dialog.result
        if not result:
            return

        tools_to_run: List[str] = result["tools"]
        scope = result["scope"]

        # Determine scope text
        original_text = self.current_content
        if scope == "selection" and selection_available and selection_indices:
            target_text = selected_text or ""
        else:
            target_text = original_text

        if target_text is None:
            messagebox.showwarning("No content", "Nothing to process with the selected tools.")
            return

        def worker():
            self._start_busy("Running quick tools…")
            text = target_text
            log_entries: List[str] = []

            try:
                for key in tools_to_run:
                    tool_def = next((t for t in TOOL_DEFINITIONS if t["key"] == key), None)
                    if not tool_def:
                        continue

                    label = tool_def["label"]
                    mutates = tool_def.get("mutates", False)
                    start_time = datetime.now()

                    if key == "fix_toc_plain":
                        text, change_count = fix_toc_plain.fix_toc_plain(text)
                        log_entries.append(f"{label} → {change_count} adjustments")
                    elif key == "remove_images":
                        text, removed, _ = remove_image_references(text)
                        log_entries.append(f"{label} → removed {removed} images")
                    elif key == "remove_blockquotes":
                        remover = BlockquoteRemover()
                        text = remover.remove_blockquotes(text)
                        log_entries.append(f"{label} → stripped blockquotes")
                    elif key == "remove_page_numbers":
                        text, removed, _ = remove_isolated_page_numbers(text)
                        log_entries.append(f"{label} → removed {removed} lines")
                    elif key == "markdown_formatting":
                        formatter = MarkdownFormattingFixer(config=self._load_formatter_config())
                        text = formatter.fix_content(text)
                        log_entries.append(f"{label} → {len(formatter.changes)} changes")
                    elif key == "fix_long_lines":
                        text, changed_lines, total_breaks = self._apply_fix_long_lines(text)
                        log_entries.append(f"{label} → reshaped {changed_lines} lines, {total_breaks} breaks")
                    elif key == "fix_tables":
                        text, changes = fix_table_formatting.fix_table_formatting(text)
                        log_entries.append(f"{label} → {len(changes)} adjustments")
                    elif key == "fix_ocr_base":
                        text, changes = fix_ocr_errors(text)
                        log_entries.append(f"{label} → {len(changes)} substitutions")
                    elif key == "fix_ocr_additional":
                        text, corrections, total, _ = fix_additional_ocr_errors(text)
                        log_entries.append(f"{label} → {total} corrections")
                    elif key == "spell_check":
                        checker = SpellChecker()
                        findings = checker.find_potential_issues(text)
                        log_entries.append(f"{label} → {len(findings)} findings")
                    elif key == "long_line_detector":
                        detector = LongLineDetector()
                        # placeholder for analysis
                        log_entries.append(f"{label} → analysis queued")
                    elif key == "paragraph_break_detector":
                        detector = ParagraphBreakDetector()
                        issues = detector.analyze_file(text)
                        log_entries.append(f"{label} → {len(issues or [])} issues")
                    elif key == "final_validation":
                        validator = MarkdownValidator()
                        problems = validator.validate(text)
                        log_entries.append(f"{label} → {len(problems)} problems")
                    else:
                        log_entries.append(f"{label} → skipped (unknown)")

                    end_time = datetime.now()
                    duration_ms = int((end_time - start_time).total_seconds() * 1000)
                    self._append_change_log(f"{label} on {scope}: {duration_ms} ms")

                # Apply results back to UI
                if scope == "selection" and selection_indices:
                    self._replace_selection_text(text, selection_indices)
                else:
                    self._set_preview(text)

                self._append_change_log("; ".join(log_entries))
                self._stop_busy("Quick tools complete")
            except Exception as exc:
                self._stop_busy("Error")
                messagebox.showerror("Quick tools error", str(exc))

        threading.Thread(target=worker, daemon=True).start()

    def _load_formatter_config(self) -> Dict[str, Any]:
        config = self._get_pipeline_config()
        return config.get('formatter', {}) or {}

    def _apply_fix_long_lines(self, text: str) -> Tuple[str, int, int]:
        config = self._get_pipeline_config()
        threshold = config.get('line_length_threshold', 150)
        try:
            threshold = int(threshold)
        except (TypeError, ValueError):
            threshold = 150

        detector = LongLineDetector(threshold=threshold, min_sentence_length=40)
        lines = text.split('\n')
        new_lines: List[str] = []
        changed = 0
        total_breaks = 0

        for line in lines:
            if detector.is_special_line(line, ignore_headers=True, ignore_code=True):
                new_lines.append(line)
                continue
            if len(line) <= threshold:
                new_lines.append(line)
                continue

            breaks = detector.find_optimal_breaks(line)
            break_positions = [pos for pos, _reason in breaks]
            if not break_positions:
                new_lines.append(line)
                continue

            wrapped = detector.apply_breaks(line, break_positions)
            if wrapped != line:
                changed += 1
                total_breaks += max(1, len(break_positions))
            new_lines.append(wrapped)

        new_text = '\n'.join(new_lines)
        if text.endswith('\n') and not new_text.endswith('\n'):
            new_text += '\n'

        return new_text, changed, total_breaks

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