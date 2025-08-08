import re
import csv
import sys
import argparse
from io import StringIO

def parse_messy_text(raw_text: str) -> list[list[str]]:
    """
    Parses messy, semi-structured text into a structured list of lists.

    This function replicates the logic from the JavaScript web app, using
    semantic rules to identify categories, sections, and data pairs.

    Args:
        raw_text: A string containing the messy text.

    Returns:
        A list of lists representing the structured data, including a header row.
        Returns an empty list if the input is empty.
    """
    # 1) Clean invisibles, drop underscores/colons, and split into lines
    # Note: \u200B-\u200D, \uFEFF, \u00A0 are zero-width spaces, BOMs, and non-breaking spaces.
    cleaned_text = re.sub(r'[\u200B-\u200D\uFEFF\u00A0_:]', '', raw_text)
    lines = [line.strip() for line in cleaned_text.splitlines() if line.strip()]

    if not lines:
        return []

    # 2) The first line is assumed to be the category
    category = lines.pop(0)

    rows = []
    orphans = []
    section = ""

    # Regex for values: single numbers, "x to y" ranges, percentages, or x-multipliers
    value_re = re.compile(r'^[+\d.]+(?:\s*to\s*[+\d.]+)?%?$', re.IGNORECASE)
    multiplier_re = re.compile(r'^x\d+', re.IGNORECASE)

    # Regex for detecting a section header line
    section_header_re = re.compile(r'multiplier', re.IGNORECASE)

    i = 0
    while i < len(lines):
        line = lines[i]
        next_line = lines[i + 1] if i + 1 < len(lines) else ""

        # 3) Identify a section header
        # A line is a section header if it contains only letters/spaces and the *next* line contains "Multiplier"
        if line.replace(' ', '').isalpha() and section_header_re.search(next_line):
            section = line
            i += 2  # Skip the current line and the "Multiplier" label line
            continue

        # 4) Identify a descriptor + value/multiplier pair
        if value_re.match(next_line) or multiplier_re.match(next_line):
            rows.append([category, section, line, next_line])
            i += 2  # Skip the current line and the value/multiplier line
        else:
            # This line is not a section header and not part of a pair, so it's an orphan.
            orphans.append(line)
            i += 1

    # 5) Log any orphans for debugging purposes
    if orphans:
        print(f"Warning: Unpaired descriptors found and skipped: {orphans}")

    # 6) Prepend the header row to the final data
    header = ["Category", "Section", "Descriptor", "Multiplier"]
    return [header] + rows

def format_as_tsv(data: list[list[str]]) -> str:
    """Formats structured data as Tab-Separated Values."""
    return '\n'.join(['\t'.join(row) for row in data])

def format_as_markdown(data: list[list[str]]) -> str:
    """Formats structured data as a Markdown document with tables."""
    if len(data) < 2:
        return ""

    headers = data[0]
    rows = data[1:]
    category = rows[0][0] if rows else ""

    markdown = f"# {category}\n\n"
    current_section = ""

    for row in rows:
        section, descriptor, value = row[1], row[2], row[3]

        if section != current_section:
            current_section = section
            markdown += f"### {current_section}\n\n"
            markdown += f"| {headers[2]} | {headers[3]} |\n"
            markdown += "| :--- | :--- |\n"

        markdown += f"| {descriptor} | {value} |\n"

    return markdown

def format_as_csv(data: list[list[str]]) -> str:
    """Formats structured data as Comma-Separated Values, handling quotes."""
    output = StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)
    writer.writerows(data)
    return output.getvalue()

def main():
    """
    Main function to run the parser from the command line.
    Reads text from stdin, parses it, and prints the formatted output to stdout.
    """
    parser = argparse.ArgumentParser(
        description="Parse messy TTRPG notes and format them as TSV, Markdown, or CSV.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Example usage:
  cat your_file.txt | python book_parser.py --format md
  (Select text in VS Code and run a task that pipes it to this script)
"""
    )
    parser.add_argument(
        "--format",
        choices=["tsv", "md", "csv"],
        required=True,
        help="The output format."
    )
    args = parser.parse_args()

    # Read the input from stdin (standard input)
    input_text = sys.stdin.read()

    if not input_text.strip():
        print("Error: No input provided.", file=sys.stderr)
        sys.exit(1)

    # 1. Parse the text
    structured_data = parse_messy_text(input_text)

    if not structured_data or len(structured_data) < 2:
        print("Warning: No data could be parsed from the input.", file=sys.stderr)
        sys.exit(0)

    # 2. Generate the chosen format
    output = ""
    if args.format == "tsv":
        output = format_as_tsv(structured_data)
    elif args.format == "md":
        output = format_as_markdown(structured_data)
    elif args.format == "csv":
        output = format_as_csv(structured_data)

    # 3. Print the result to stdout (standard output)
    print(output)


if __name__ == "__main__":
    main()
