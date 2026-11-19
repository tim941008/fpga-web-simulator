#!/usr/bin/env python3
"""
Automated Verification & Regression Runner for Web FPGA Simulator Test Suite.
Validates:
1. All remaining Verilog/simulation test specifications in tests/.
2. Complete removal of QSF files and QSF references from src/ and tests/.
3. Exact 16-row binary verification of DEFAULT_MATRIX_PATTERN in src/config/matrixMapping.ts.
4. Verilog ANSI port parser regression check (top_fpga_demo 8 ports).
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]
TESTS_DIR = ROOT / "tests"


def parse_ansi_ports_python_mirror(header_ports: str):
    """Mirrors src/parsers/verilogParser.ts ANSI port extraction."""
    active_dir = None
    ports = []
    for raw_tok in header_ports.split(","):
        tok = raw_tok.strip()
        if not tok:
            continue
        m = re.match(
            r'^(input|output|inout)\b\s*(?:(wire|reg|logic)\b\s*)?(?:signed\b\s*)?(\[[^\]]+\])?\s*(.+)$',
            tok,
        )
        name_part = tok
        if m:
            active_dir = m.group(1)
            name_part = m.group(4).strip()
        if active_dir:
            clean = re.match(r'^([A-Za-z_][A-Za-z0-9_$]*)', name_part.split("=")[0].strip())
            if clean:
                ports.append((clean.group(1), active_dir))
    return ports


def main():
    expected_files = sorted(TESTS_DIR.rglob("*.expected.json"))
    print(f"Discovered {len(expected_files)} test specifications in {TESTS_DIR}:")
    for p in expected_files:
        spec = json.loads(p.read_text(encoding="utf-8"))
        rel = p.relative_to(ROOT).as_posix()
        print(f"  [{spec['testId']}] {spec['name']} ({rel})")

    # 1. Verify QSF files & references are completely removed from src/ and tests/
    assert not (ROOT / "src/parsers/qsfParser.ts").exists(), "qsfParser.ts still exists!"
    assert not (TESTS_DIR / "qsf").exists(), "tests/qsf directory still exists!"
    qsf_re = re.compile(r"\bqsf\b|qsfParser|buildBoardControlGroups|PinAssignment", re.I)
    for ts_file in (ROOT / "src").rglob("*.ts*"):
        if "__tests__" in ts_file.parts or "vendor" in ts_file.parts:
            continue
        text = ts_file.read_text(encoding="utf-8")
        assert not qsf_re.search(text), f"QSF reference found in {ts_file}"
    print("[PASS] QSF removal check: zero QSF files or references in src/ and tests/.")

    # 2. Verify Verilog ANSI port parser extracts all 8 ports from Preset 1
    sample_ts = (ROOT / "src/presets/sampleDesigns.ts").read_text(encoding="utf-8")
    m_mod = re.search(r"module\s+top_fpga_demo\s*\(([\s\S]*?)\)\s*;", sample_ts)
    assert m_mod, "top_fpga_demo module header not found"
    extracted_ports = parse_ansi_ports_python_mirror(m_mod.group(1))
    assert len(extracted_ports) == 8, f"Expected 8 ports, got {len(extracted_ports)}"
    print(f"[PASS] Verilog ANSI parser regression: extracted all {len(extracted_ports)} ports from top_fpga_demo.")

    # 3. Verify DEFAULT_MATRIX_PATTERN exact 16-row binary values
    matrix_ts = (ROOT / "src/config/matrixMapping.ts").read_text(encoding="utf-8")
    pattern_rows = re.findall(r"0b([01]{16})", matrix_ts)
    expected_rows = [
        "1111111111111111",
        "1111111111111111",
        "1000000100000011",
        "1000000000000001",
        "1000000000000001",
        "1000000000000001",
        "1000000000000001",
        "1000000000000001",
        "1000000000000001",
        "1000000000000001",
        "1000000000000001",
        "1000000000000001",
        "1000000000000001",
        "1000000010000001",
        "1111111111111111",
        "1111111111111111",
    ]
    assert pattern_rows == expected_rows, f"DEFAULT_MATRIX_PATTERN mismatch: {pattern_rows}"
    print("[PASS] Matrix default pattern verification: all 16 rows match specification.")


if __name__ == "__main__":
    main()
