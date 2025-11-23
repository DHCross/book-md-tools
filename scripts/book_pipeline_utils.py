import re


_DICE_PATTERN_D_SPACE_NUM = re.compile(r"\b(d)\s+(\d+)\b")
_DICE_PATTERN_NUM_SPACE_D = re.compile(r"\b(\d+)\s+(d\d+)\b")


def normalize_dice_notation(text: str) -> str:
    """Normalize dice notation by fixing common OCR spacing errors.

    Examples:
    - "d 6" -> "d6"
    - "1 d20" -> "1d20"
    """
    text = _DICE_PATTERN_D_SPACE_NUM.sub(r"\1\2", text)
    text = _DICE_PATTERN_NUM_SPACE_D.sub(r"\1\2", text)
    return text


_OCR_REPLACEMENTS = [
    (re.compile(r"\btonch\b"), "touch"),
    (re.compile(r"\bgronnd\b"), "ground"),
    (re.compile(r"\bcanse\b"), "cause"),
    (re.compile(r"\bconnt\b"), "count"),
    (re.compile(r"\bthongh\b"), "though"),
    (re.compile(r"\bonr\b"), "our"),
    (re.compile(r"\bsonrce\b"), "source"),
]


def clean_common_ocr_artifacts(text: str) -> str:
    """Fix specific recurring OCR artifacts in the source text."""
    for pattern, replacement in _OCR_REPLACEMENTS:
        text = pattern.sub(replacement, text)
    return text

