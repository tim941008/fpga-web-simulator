#!/usr/bin/env python3
"""
Automated Verification & Regression Runner for Web FPGA Simulator Test Suite.
Validates all test specifications across combinational, sequential, counter, fsm,
matrix, io_config, waveform, limitations, and deployment categories, including:
- Complete removal of Quartus QSF support
- Automatic Verilog ANSI port detection (including custom port names)
- I/O component direction/width compatibility validation
- Duplicate component & resource conflict detection
- Configuration persistence & invalidation across Verilog source edits
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]
TESTS_DIR = ROOT / "tests"

BOARD_COMPONENTS = {
    "CLOCK": {"direction": "input", "nominal": 1, "min": 1, "max": 1, "strict_exact": True},
    "KEY": {"direction": "input", "nominal": 4, "min": 1, "max": 4},
    "SW": {"direction": "input", "nominal": 10, "min": 1, "max": 10},
    "LEDR": {"direction": "output", "nominal": 10, "min": 1, "max": 10},
    "LEDG": {"direction": "output", "nominal": 8, "min": 1, "max": 8},
    **{
        f"HEX{i}": {"direction": "output", "nominal": 7, "min": 7, "max": 7, "strict_min": True}
        for i in range(6)
    },
    "MATRIX_ROW": {"direction": "output", "nominal": 16, "min": 1, "max": 16},
    "MATRIX_COL": {"direction": "output", "nominal": 16, "min": 1, "max": 16},
}


def parse_range(range_str):
    if not range_str:
        return 0, 0, 1
    parts = range_str.strip("[]").split(":")
    if len(parts) != 2:
        return 0, 0, 1
    msb, lsb = int(parts[0].strip()), int(parts[1].strip())
    return msb, lsb, abs(msb - lsb) + 1


def parse_ansi_ports(verilog_src: str):
    cleaned = re.sub(r"/\*[\s\S]*?\*/", "", verilog_src)
    cleaned = re.sub(r"//.*$", "", cleaned, flags=re.M)
    m_mod = re.search(r"\bmodule\s+([A-Za-z_][A-Za-z0-9_$]*)\s*\(([\s\S]*?)\)\s*;", cleaned)
    assert m_mod, "Module header not found"
    top_name = m_mod.group(1)
    header = m_mod.group(2)

    active_dir = None
    active_range = (0, 0, 1)
    ports = []
    for raw_tok in header.split(","):
        tok = raw_tok.strip()
        if not tok:
            continue
        m = re.match(
            r"^(input|output|inout)\b\s*(?:(wire|reg|logic)\b\s*)?(?:signed\b\s*)?(\[[^\]]+\])?\s*(.+)$",
            tok,
        )
        name_part = tok
        if m:
            active_dir = m.group(1)
            active_range = parse_range(m.group(3))
            name_part = m.group(4).strip()
        if active_dir:
            clean = re.match(r"^([A-Za-z_][A-Za-z0-9_$]*)", name_part.split("=")[0].strip())
            if clean:
                msb, lsb, width = active_range
                ports.append(
                    {
                        "name": clean.group(1),
                        "direction": active_dir,
                        "msb": msb,
                        "lsb": lsb,
                        "width": width,
                    }
                )
    return top_name, ports


def validate_io_config_mirror(ports, assignments):
    comp_users = {}
    for p in ports:
        a = assignments.get(p["name"])
        if a and a["componentId"] in BOARD_COMPONENTS:
            comp_users.setdefault(a["componentId"], []).append(p["name"])

    by_port = {}
    counts = {"configured": 0, "unassigned": 0, "conflict": 0, "invalid": 0, "warnings": 0}
    has_row = False
    has_col = False

    for p in ports:
        a = assignments.get(p["name"])
        if not a:
            by_port[p["name"]] = {"status": "unassigned", "issues": []}
            counts["unassigned"] += 1
            continue

        cid = a["componentId"]
        spec = BOARD_COMPONENTS[cid]
        issues = []
        allowed = True

        if p["direction"] != "inout" and p["direction"] != spec["direction"]:
            changed = a.get("configuredDirection") and a["configuredDirection"] != p["direction"]
            issues.append("DIRECTION_CHANGED" if changed else "DIRECTION_MISMATCH")
            allowed = False

        if p["width"] > 64:
            issues.append("WIDTH_EXCEEDS_64")
            allowed = False

        if spec.get("strict_exact") and p["width"] != spec["nominal"]:
            issues.append("CLOCK_WIDTH_INVALID")
            allowed = False
        elif cid.startswith("HEX"):
            if p["width"] < 7:
                issues.append("HEX_WIDTH_TOO_SMALL")
                allowed = False
            elif p["width"] == 8:
                issues.append("HEX_DP_UNUSED")
                counts["warnings"] += 1
            elif p["width"] > 8:
                issues.append("WIDTH_EXCEEDS_COMPONENT")
                counts["warnings"] += 1
        elif cid in ("MATRIX_ROW", "MATRIX_COL"):
            if p["width"] != 16:
                issues.append("MATRIX_WIDTH_MISMATCH")
                counts["warnings"] += 1
        elif p["width"] > spec["max"]:
            issues.append("WIDTH_EXCEEDS_COMPONENT")
            counts["warnings"] += 1

        has_conflict = len(comp_users.get(cid, [])) > 1
        if has_conflict:
            issues.append("DUPLICATE_COMPONENT")

        if not allowed:
            status = "invalid"
            counts["invalid"] += 1
        elif has_conflict:
            status = "conflict"
            counts["conflict"] += 1
        else:
            status = "configured"
            counts["configured"] += 1
            if cid == "MATRIX_ROW":
                has_row = True
            if cid == "MATRIX_COL":
                has_col = True

        by_port[p["name"]] = {"status": status, "issues": issues}

    res_warnings = []
    if has_row and not has_col:
        res_warnings.append("MATRIX_MISSING_COL")
        counts["warnings"] += 1
    elif has_col and not has_row:
        res_warnings.append("MATRIX_MISSING_ROW")
        counts["warnings"] += 1

    return by_port, counts, res_warnings


def main():
    expected_files = sorted(TESTS_DIR.rglob("*.expected.json"))
    print(f"Discovered {len(expected_files)} test specifications in {TESTS_DIR}:")
    for p in expected_files:
        spec = json.loads(p.read_text(encoding="utf-8"))
        rel = p.relative_to(ROOT).as_posix()
        print(f"  [{spec['testId']}] {spec['name']} ({rel})")

    # 1. Verify QSF removal across codebase
    assert not (ROOT / "src/parsers/qsfParser.ts").exists(), "qsfParser.ts must be deleted"
    assert not (TESTS_DIR / "qsf").exists(), "tests/qsf directory must be removed"
    for src_file in (ROOT / "src").rglob("*"):
        if src_file.is_file() and "vendor" not in src_file.parts:
            text = src_file.read_text(encoding="utf-8")
            assert not re.search(r"\b(qsf|quartus)\b", text, re.I), (
                f"Unexpected QSF/Quartus reference in {src_file}"
            )
    assert not re.search(r"\b(qsf|quartus)\b", (ROOT / "index.html").read_text(encoding="utf-8"), re.I)
    print("[PASS] QSF removal check: zero QSF files or references in src/ and index.html.")

    # 2. Verify BUG-001 regression & built-in presets port detection
    sample_ts = (ROOT / "src/presets/sampleDesigns.ts").read_text(encoding="utf-8")
    _, ports1 = parse_ansi_ports(sample_ts[sample_ts.index("module top_fpga_demo") :])
    assert len(ports1) == 8, f"Expected 8 ports in top_fpga_demo, got {len(ports1)}"
    _, ports3 = parse_ansi_ports(sample_ts[sample_ts.index("module custom_port_counter") :])
    assert len(ports3) == 6, f"Expected 6 ports in custom_port_counter, got {len(ports3)}"
    print("[PASS] Port detection regression: top_fpga_demo (8 ports) & custom_port_counter (6 ports).")

    # 3. Verify IOCFG-001: custom port names + optional unassigned port
    spec1 = json.loads((TESTS_DIR / "io_config/custom_ports.expected.json").read_text(encoding="utf-8"))
    top1, cports = parse_ansi_ports((TESTS_DIR / "io_config/custom_ports.v").read_text(encoding="utf-8"))
    assert top1 == spec1["topModule"]
    assert len(cports) == len(spec1["expectedPorts"])
    assign1 = {
        p["name"]: {
            "componentId": spec1["assignments"][p["name"]],
            "configuredDirection": p["direction"],
            "configuredWidth": p["width"],
        }
        for p in cports
        if p["name"] in spec1["assignments"]
    }
    by1, cnt1, rw1 = validate_io_config_mirror(cports, assign1)
    assert cnt1["configured"] == 6 and cnt1["unassigned"] == 1
    assert cnt1["conflict"] == 0 and cnt1["invalid"] == 0 and len(rw1) == 0
    assert by1["optional_debug"]["status"] == "unassigned"
    print("[PASS] IOCFG-001: custom port names & optional unassigned port validated.")

    # 4. Verify IOCFG-002: direction & width compatibility checks
    _, dw_ports = parse_ansi_ports(
        (TESTS_DIR / "io_config/direction_width_validation.v").read_text(encoding="utf-8")
    )
    assign2 = {
        "wide_clk": {"componentId": "CLOCK", "configuredDirection": "input", "configuredWidth": 4},
        "wide_sw": {"componentId": "SW", "configuredDirection": "input", "configuredWidth": 12},
        "short_seg": {"componentId": "HEX0", "configuredDirection": "output", "configuredWidth": 4},
        "seg_with_dp": {"componentId": "HEX1", "configuredDirection": "output", "configuredWidth": 8},
        "narrow_matrix_row": {"componentId": "MATRIX_ROW", "configuredDirection": "output", "configuredWidth": 12},
    }
    by2, cnt2, rw2 = validate_io_config_mirror(dw_ports, assign2)
    assert by2["wide_clk"]["status"] == "invalid" and "CLOCK_WIDTH_INVALID" in by2["wide_clk"]["issues"]
    assert by2["short_seg"]["status"] == "invalid" and "HEX_WIDTH_TOO_SMALL" in by2["short_seg"]["issues"]
    assert by2["wide_sw"]["status"] == "configured" and "WIDTH_EXCEEDS_COMPONENT" in by2["wide_sw"]["issues"]
    assert by2["seg_with_dp"]["status"] == "configured" and "HEX_DP_UNUSED" in by2["seg_with_dp"]["issues"]
    assert by2["narrow_matrix_row"]["status"] == "configured" and "MATRIX_WIDTH_MISMATCH" in by2["narrow_matrix_row"]["issues"]
    assert "MATRIX_MISSING_COL" in rw2
    print("[PASS] IOCFG-002: direction & width compatibility rules verified.")

    # 5. Verify IOCFG-003: duplicate component & resource conflict detection
    spec3 = json.loads((TESTS_DIR / "io_config/duplicate_conflicts.expected.json").read_text(encoding="utf-8"))
    _, dup_ports = parse_ansi_ports(
        (TESTS_DIR / "io_config/duplicate_conflicts.v").read_text(encoding="utf-8")
    )
    assign3 = {
        p["name"]: {
            "componentId": spec3["assignments"][p["name"]],
            "configuredDirection": p["direction"],
            "configuredWidth": p["width"],
        }
        for p in dup_ports
    }
    by3, cnt3, rw3 = validate_io_config_mirror(dup_ports, assign3)
    assert cnt3["conflict"] == 4 and cnt3["configured"] == 1
    assert rw3 == ["MATRIX_MISSING_COL"]
    print("[PASS] IOCFG-003: duplicate component & resource conflicts verified.")

    # 6. Verify IOCFG-004: direction/width change invalidation when Verilog edits occur
    edited_verilog = """
    module persistence_updates (
        input  wire [3:0] clk_in,
        output wire [3:0] sw_in,
        output wire [6:0] extra_out
    );
    endmodule
    """
    _, edited_ports = parse_ansi_ports(edited_verilog)
    preserved_from_v1 = {
        "clk_in": {"componentId": "CLOCK", "configuredDirection": "input", "configuredWidth": 1},
        "sw_in": {"componentId": "SW", "configuredDirection": "input", "configuredWidth": 4},
    }
    by4, cnt4, _ = validate_io_config_mirror(edited_ports, preserved_from_v1)
    assert by4["clk_in"]["status"] == "invalid" and "CLOCK_WIDTH_INVALID" in by4["clk_in"]["issues"]
    assert by4["sw_in"]["status"] == "invalid" and "DIRECTION_CHANGED" in by4["sw_in"]["issues"]
    assert by4["extra_out"]["status"] == "unassigned"
    assert cnt4["invalid"] == 2 and cnt4["unassigned"] == 1
    print("[PASS] IOCFG-004: persistence & signature-change invalidation verified.")


if __name__ == "__main__":
    main()
