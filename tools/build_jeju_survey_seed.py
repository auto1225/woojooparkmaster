#!/usr/bin/env python3
"""Extract and validate the December 2025 Jeju paid-parking survey PDF.

The Hancom PDF stores Korean text with a broken character map. This script
repairs the text, reconstructs table cells from word coordinates, validates all
112 detail rows, and emits both an audit JSON file and a deterministic SQL seed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from dataclasses import dataclass
from difflib import get_close_matches
from pathlib import Path
from typing import Any, Iterable

import pdfplumber


EXPECTED_SHA256 = "6898406b5411d78c6e7422b85fb7686e779420d5b3311ea2ea7acecfcc349b1f"
SOURCE_CODE = "JEJU_PAID_PARKING_2025_12"
SOURCE_ID = "56a6ca8a-b15f-4f33-a855-3f5aa806fc18"


@dataclass(frozen=True)
class Section:
    pages: tuple[int, ...]
    columns: tuple[str, ...]


SECTIONS = {
    "spaces": Section(tuple(range(18, 22)), (
        "section_id", "name", "address", "total_spaces", "disabled_spaces",
        "ev_spaces", "compact_spaces", "pregnant_spaces", "other_spaces",
        "other_space_type",
    )),
    "lot_type": Section(tuple(range(22, 25)), (
        "section_id", "name", "address", "lot_type", "floors",
    )),
    "surface": Section(tuple(range(25, 29)), (
        "section_id", "name", "address", "surface_type",
    )),
    "hours": Section(tuple(range(29, 32)), (
        "section_id", "name", "address", "operation_category", "operating_hours_text",
    )),
    "staff": Section(tuple(range(33, 36)), (
        "section_id", "name", "address", "management_type", "resident_staff_count",
    )),
    "integration": Section(tuple(range(37, 40)), (
        "section_id", "name", "address", "control_system_status", "parking_portal_status",
    )),
    "display": Section(tuple(range(40, 43)), (
        "section_id", "name", "address", "display_installation_status",
        "display_network_type", "display_use_status",
    )),
    "access": Section(tuple(range(43, 46)), (
        "section_id", "name", "address", "entrance_count", "exit_count",
        "entrance_exit_shared",
    )),
    "sensor": Section(tuple(range(47, 50)), (
        "section_id", "name", "address", "existing_sensor_status",
        "sensor_manufacturer", "sensor_use_status",
    )),
    "control_vendor": Section(tuple(range(51, 54)), (
        "section_id", "name", "address", "control_manufacturer",
    )),
    "utilization": Section(tuple(range(55, 60)), (
        "section_id", "name", "address", "utilization_band", "peak_period",
        "primary_users", "user_notes",
    )),
    "sensor_plan": Section(tuple(range(61, 64)), (
        "section_id", "name", "address", "new_sensor_target_count",
        "gateway_target_count", "display_development_possible", "portal_link_possible",
    )),
    "environment": Section(tuple(range(64, 68)), (
        "section_id", "name", "address", "power_supply_status",
        "wired_network_status", "windows_update_status",
    )),
    "priority": Section(tuple(range(72, 75)), (
        "section_id", "name", "address", "priority_score", "priority_note",
    )),
}


def repair_text(value: str | None) -> str:
    if not value:
        return ""
    repaired: list[str] = []
    for line in value.splitlines():
        try:
            repaired.append(line.encode("cp1252").decode("cp949"))
        except (UnicodeEncodeError, UnicodeDecodeError):
            repaired.append(line)
    return clean_text(" ".join(repaired))


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def normalized_key(value: str) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣]", "", value).lower()


def canonical_name(value: str) -> str:
    # Remove spaces introduced only by a PDF line break inside a proper name.
    return value.replace("(서 부", "(서부")


def to_int(value: str, default: int = 0) -> int:
    cleaned = value.replace(",", "").replace(" ", "").strip()
    if not cleaned:
        return default
    if not re.fullmatch(r"-?\d+", cleaned):
        raise ValueError(f"Expected integer, got {value!r}")
    return int(cleaned)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def find_pdf(explicit: Path | None) -> Path:
    if explicit:
        return explicit.resolve()
    for root in (Path("D:/"), Path.home() / "Desktop"):
        if not root.exists():
            continue
        for candidate in root.rglob("*.pdf"):
            try:
                if sha256(candidate) == EXPECTED_SHA256:
                    return candidate.resolve()
            except OSError:
                continue
    raise FileNotFoundError("The Jeju parking survey PDF was not found. Pass --pdf explicitly.")


def word_cell_text(
    words: list[dict[str, Any]], x0: float, x1: float, top: float, bottom: float
) -> str:
    selected = [
        word for word in words
        if x0 - 0.5 <= (word["x0"] + word["x1"]) / 2 <= x1 + 0.5
        and top - 1 <= (word["top"] + word["bottom"]) / 2 <= bottom + 1
    ]
    lines: list[list[dict[str, Any]]] = []
    for word in sorted(selected, key=lambda item: (item["top"], item["x0"])):
        line = next((item for item in lines if abs(item[0]["top"] - word["top"]) < 3), None)
        if line is None:
            line = []
            lines.append(line)
        line.append(word)
    return clean_text(" ".join(
        " ".join(repair_text(word["text"]) for word in sorted(line, key=lambda item: item["x0"]))
        for line in lines
    ))


def table_numeric_row_count(table: Any) -> int:
    count = 0
    for row in table.extract():
        if row and repair_text(row[0]).isdigit():
            count += 1
    return count


def extract_page_rows(page: Any, column_count: int) -> list[list[str]]:
    candidates = [
        table for table in page.find_tables()
        if max((sum(cell is not None for cell in row.cells) for row in table.rows), default=0) >= column_count
    ]
    if not candidates:
        return []
    table = max(candidates, key=lambda item: (table_numeric_row_count(item), len(item.rows)))
    words = page.extract_words()

    edge_frequency: Counter[float] = Counter(
        round(edge, 3)
        for row in table.rows
        for cell in row.cells
        if cell is not None
        for edge in (cell[0], cell[2])
    )
    bounds = sorted(edge for edge, _ in edge_frequency.most_common(column_count + 1))
    if len(bounds) != column_count + 1:
        raise ValueError(f"Could not determine {column_count} columns on PDF page {page.page_number}")

    extracted: list[list[str]] = []
    for row in table.rows:
        cells = [cell for cell in row.cells if cell is not None]
        if not cells:
            continue
        # The final "count" column often spans dozens of rows. The first cell
        # is the row-local ID cell and therefore gives the correct row height.
        top = cells[0][1]
        bottom = cells[0][3]
        extracted.append([
            word_cell_text(words, bounds[index], bounds[index + 1], top, bottom)
            for index in range(column_count)
        ])
    return extracted


def append_continuation(previous: dict[str, Any], columns: tuple[str, ...], values: list[str]) -> None:
    for column, value in zip(columns, values):
        if not value:
            continue
        current = str(previous.get(column, ""))
        previous[column] = clean_text(f"{current} {value}")


def extract_section(pdf: Any, section_name: str, section: Section) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for page_number in section.pages:
        page_rows = extract_page_rows(pdf.pages[page_number - 1], len(section.columns))
        for row_index, values in enumerate(page_rows):
            identifier = values[0].replace(" ", "")
            if identifier.isdigit():
                record = dict(zip(section.columns, values))
                record["section_id"] = int(identifier)
                record["pdf_page"] = page_number
                records.append(record)
            elif (
                row_index == 0 and records and not identifier
                and any(values[index] for index in range(min(3, len(values))))
            ):
                append_continuation(records[-1], section.columns, values)

    expected_ids = list(range(1, 113))
    actual_ids = [record["section_id"] for record in records]
    if actual_ids != expected_ids:
        raise ValueError(
            f"Section {section_name} did not yield IDs 1..112: "
            f"count={len(actual_ids)}, first={actual_ids[:5]}, last={actual_ids[-5:]}"
        )
    return records


def index_master(records: list[dict[str, Any]]) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    by_name: dict[str, dict[str, Any]] = {}
    by_address: dict[str, dict[str, Any]] = {}
    for record in records:
        name_key = normalized_key(record["name"])
        address_key = normalized_key(record["address"])
        if name_key in by_name:
            raise ValueError(f"Duplicate canonical parking-lot name: {record['name']}")
        by_name[name_key] = record
        if address_key and address_key not in by_address:
            by_address[address_key] = record
    return by_name, by_address


def attach_section(
    lots: list[dict[str, Any]], section_name: str, section_rows: list[dict[str, Any]]
) -> None:
    by_name, by_address = index_master(lots)
    attached: set[int] = set()
    for row in section_rows:
        name_key = normalized_key(row["name"])
        target = by_name.get(name_key)
        if target is None and section_name != "integration":
            target = by_address.get(normalized_key(row["address"]))
        if target is None:
            suggestions = get_close_matches(name_key, by_name.keys(), n=3, cutoff=0.65)
            names = [by_name[item]["name"] for item in suggestions]
            raise ValueError(f"Unmatched {section_name} row {row['name']!r}; candidates={names}")
        record_no = int(target["source_record_no"])
        if record_no in attached:
            raise ValueError(f"Section {section_name} mapped more than once to {target['name']}")
        attached.add(record_no)
        target["sections"][section_name] = row
    if len(attached) != 112:
        missing = [lot["name"] for lot in lots if lot["source_record_no"] not in attached]
        raise ValueError(f"Section {section_name} is missing canonical lots: {missing}")


def counter(records: Iterable[dict[str, Any]], key: str) -> dict[str, int]:
    return dict(sorted(Counter(str(record[key]) for record in records).items()))


def build_dataset(pdf_path: Path) -> dict[str, Any]:
    actual_sha = sha256(pdf_path)
    if actual_sha != EXPECTED_SHA256:
        raise ValueError(f"Unexpected PDF SHA-256: {actual_sha}")

    with pdfplumber.open(pdf_path) as pdf:
        if len(pdf.pages) != 84:
            raise ValueError(f"Expected 84 PDF pages, got {len(pdf.pages)}")
        extracted = {
            name: extract_section(pdf, name, section)
            for name, section in SECTIONS.items()
        }

    lots: list[dict[str, Any]] = []
    for row in extracted["spaces"]:
        total = to_int(row["total_spaces"])
        disabled = to_int(row["disabled_spaces"])
        ev = to_int(row["ev_spaces"])
        compact = to_int(row["compact_spaces"])
        pregnant = to_int(row["pregnant_spaces"])
        other = to_int(row["other_spaces"])
        general = total - disabled - ev - compact - pregnant - other
        if general < 0:
            raise ValueError(f"Negative general-space count for {row['name']}")
        lots.append({
            "source_record_no": row["section_id"],
            "code": f"JJP-{row['section_id']:03d}",
            "name": canonical_name(row["name"]),
            "address": row["address"],
            "total_spaces": total,
            "general_spaces": general,
            "disabled_spaces": disabled,
            "ev_spaces": ev,
            "compact_spaces": compact,
            "pregnant_spaces": pregnant,
            "other_spaces": other,
            "other_space_type": row["other_space_type"] or None,
            "sections": {"spaces": row},
        })

    for section_name, rows in extracted.items():
        if section_name != "spaces":
            attach_section(lots, section_name, rows)

    lot_type_map = {"복층화": "multilevel", "노외": "offstreet", "노외(공한지)": "vacant_lot"}
    surface_map = {"아스콘": "ascon", "콘크리트": "concrete", "블록": "block", "블럭": "block"}
    for lot in lots:
        sections = lot["sections"]
        type_text = sections["lot_type"]["lot_type"]
        surface_text = sections["surface"]["surface_type"]
        if type_text not in lot_type_map or surface_text not in surface_map:
            raise ValueError(f"Unknown lot type or surface for {lot['name']}: {type_text}, {surface_text}")
        lot["lot_type"] = lot_type_map[type_text]
        lot["floors"] = to_int(sections["lot_type"]["floors"], default=0) or None
        lot["surface_type"] = surface_map[surface_text]
        lot["status"] = "inactive" if sections["hours"]["operating_hours_text"] == "미운영" else "active"
        lot["has_display_board"] = sections["display"]["display_installation_status"].startswith("설치됨")
        lot["has_sensor"] = sections["sensor"]["existing_sensor_status"] == "설치됨"
        lot["control_system_linked"] = sections["integration"]["control_system_status"] == "연계"
        lot["portal_linked"] = sections["integration"]["parking_portal_status"] == "연계"
        lot["operating_hours"] = {
            "category": sections["hours"]["operation_category"],
            "source_text": sections["hours"]["operating_hours_text"],
        }
        lot["source_pages"] = {
            name: section["pdf_page"] for name, section in sections.items()
        }

    totals = {
        field: sum(int(lot[field]) for lot in lots)
        for field in (
            "total_spaces", "general_spaces", "disabled_spaces", "ev_spaces",
            "compact_spaces", "pregnant_spaces", "other_spaces",
        )
    }
    expected_totals = {
        "total_spaces": 6380,
        "general_spaces": 5358,
        "disabled_spaces": 287,
        "ev_spaces": 161,
        "compact_spaces": 510,
        "pregnant_spaces": 10,
        "other_spaces": 54,
    }
    if totals != expected_totals:
        raise ValueError(f"Parking-space totals differ from detail rows: {totals}")

    checks = {
        "record_count": len(lots),
        "space_totals": totals,
        "lot_types": counter(extracted["lot_type"], "lot_type"),
        "surfaces": counter(extracted["surface"], "surface_type"),
        "operation_categories": counter(extracted["hours"], "operation_category"),
        "operating_modes": dict(sorted(Counter(
            "미운영" if row["operating_hours_text"] == "미운영" else row["operation_category"]
            for row in extracted["hours"]
        ).items())),
        "management_types": counter(extracted["staff"], "management_type"),
        "control_system_status": counter(extracted["integration"], "control_system_status"),
        "parking_portal_status": counter(extracted["integration"], "parking_portal_status"),
        "display_installation_status": counter(extracted["display"], "display_installation_status"),
        "sensor_installation_status": counter(extracted["sensor"], "existing_sensor_status"),
        "sensor_use_status": counter(extracted["sensor"], "sensor_use_status"),
        "control_manufacturers": counter(extracted["control_vendor"], "control_manufacturer"),
        "utilization_bands": counter(extracted["utilization"], "utilization_band"),
        "new_sensor_target_total": sum(to_int(row["new_sensor_target_count"]) for row in extracted["sensor_plan"]),
        "gateway_target_total": sum(to_int(row["gateway_target_count"]) for row in extracted["sensor_plan"]),
        "resident_staff_total": sum(to_int(row["resident_staff_count"]) for row in extracted["staff"]),
        "access_patterns": dict(sorted(Counter(
            f"{row['entrance_count']}/{row['exit_count']}/{row['entrance_exit_shared']}"
            for row in extracted["access"]
        ).items())),
        "environment_patterns": dict(sorted(Counter(
            f"{row['power_supply_status']}|{row['wired_network_status']}|{row['windows_update_status']}"
            for row in extracted["environment"]
        ).items())),
    }
    required_checks = {
        "record_count": 112,
        "lot_types": {"노외": 80, "노외(공한지)": 7, "복층화": 25},
        "surfaces": {"블럭": 32, "아스콘": 55, "콘크리트": 25},
        "operating_modes": {"기본(09:00-18:00)": 103, "미운영": 3, "특정시간대": 6},
        "management_types": {"비상주(순찰)": 101, "상주": 11},
        "control_system_status": {"미연계": 36, "연계": 76},
        "parking_portal_status": {"미연계": 36, "연계": 76},
        "sensor_installation_status": {"미설치": 83, "설치됨": 29},
        "utilization_bands": {"0~30%": 7, "30~60%": 19, "60~90%": 63, "90~100%": 23},
        "new_sensor_target_total": 3857,
        "gateway_target_total": 99,
        "resident_staff_total": 19,
        "access_patterns": {"1/1/O": 2, "1/1/X": 108, "2/2/X": 2},
        "environment_patterns": {"공급 중|유선 인터넷|미설정": 112},
    }
    for check_name, expected in required_checks.items():
        if checks[check_name] != expected:
            raise ValueError(f"Validation failed for {check_name}: {checks[check_name]} != {expected}")

    discrepancies = [
        {
            "field": "parking_space_totals",
            "detail_rows": expected_totals,
            "conflicting_summary": {"pdf_page": 18, "total_spaces": 6300, "general_spaces": 5292, "disabled_spaces": 283, "ev_spaces": 157, "compact_spaces": 504},
            "resolution": "112 detail rows were summed; they match the narrative totals on PDF pages 3, 17 and 68.",
        },
        {
            "field": "management_count",
            "detail_rows": {"resident": 11, "non_resident": 101},
            "conflicting_summary": {"pdf_page": 33, "non_resident": 111},
            "resolution": "The 112 detail rows and PDF pages 13 and 69 support 11/101.",
        },
        {
            "field": "integration_count",
            "detail_rows": {"linked": 76, "not_linked": 36},
            "conflicting_summary": {"pdf_page": 37, "linked": 75, "not_linked": 37},
            "resolution": "The 112 detail rows and PDF pages 3, 13 and 69 support 76/36.",
        },
        {
            "field": "integration_addresses",
            "detail_rows": "The integration table address column is shifted from row 11 onward.",
            "resolution": "Integration statuses were joined by unique parking-lot name; canonical addresses come only from PDF pages 18-21.",
        },
        {
            "field": "display_installation_count",
            "detail_rows": {"installed": 44, "not_installed": 68},
            "conflicting_summary": {"pdf_pages": [40, 69], "installed": 43, "not_installed": 69},
            "resolution": "The database preserves all 112 detail-row installation statuses.",
        },
        {
            "field": "control_manufacturer_count",
            "detail_rows": checks["control_manufacturers"],
            "conflicting_summary": "PDF page 50 and the heading on PDF page 51 disagree on Se-eun Tech and confirmation-required counts.",
            "resolution": "The database preserves each detail row, including one dual-vendor value and the source spelling variations.",
        },
        {
            "field": "gateway_target_total",
            "detail_rows": 99,
            "conflicting_summary": {"pdf_pages": [61, 63, 70], "gateway_target_total": 100},
            "resolution": "The database preserves the sum of all 112 detail rows (99) and records the report summary discrepancy.",
        },
    ]

    return {
        "source": {
            "source_code": SOURCE_CODE,
            "title": "제주시 공영주차장 실시간 주차정보 서비스 현황조사 완료보고서",
            "publisher": "제주시청 차량관리과 운영팀",
            "contractor": "㈜우주주차",
            "report_month": "2025-12",
            "source_filename": pdf_path.name,
            "source_sha256": actual_sha,
            "source_page_count": 84,
        },
        "validation": checks,
        "discrepancies": discrepancies,
        "lots": lots,
    }


def sql_quote(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def sql_json(value: Any) -> str:
    return sql_quote(json.dumps(value, ensure_ascii=False, separators=(",", ":"))) + "::jsonb"


def render_sql(dataset: dict[str, Any]) -> str:
    source = dataset["source"]
    validation = dataset["validation"]
    discrepancies = dataset["discrepancies"]
    lots = dataset["lots"]

    lot_columns = (
        "code", "name", "address_jibun", "lot_type", "total_spaces", "disabled_spaces",
        "ev_spaces", "compact_spaces", "pregnant_spaces", "other_spaces", "floors",
        "operator_type", "surface_type", "operating_hours", "has_display_board", "has_sensor",
        "control_system_linked", "portal_linked", "power_status", "network_type", "status", "notes",
    )
    lot_values: list[str] = []
    for lot in lots:
        values = {
            **lot,
            "address_jibun": lot["address"],
            "operator_type": "other",
            "power_status": "supplied",
            "network_type": "유선 인터넷",
            "notes": "2025.12 제주시 유료 공영주차장 현황조사 원본. 좌표와 운영주체는 보고서에 기재되지 않음.",
        }
        rendered = [sql_json(values[column]) if column == "operating_hours" else sql_quote(values.get(column)) for column in lot_columns]
        lot_values.append("  (" + ", ".join(rendered) + ")")

    fact_columns = (
        "lot_code", "source_record_no", "general_spaces", "other_space_type",
        "operation_category", "operating_hours_text", "management_type", "resident_staff_count",
        "control_system_linked", "parking_portal_linked", "display_installation_status",
        "display_network_type", "display_use_status", "entrance_count", "exit_count",
        "entrance_exit_shared", "existing_sensor_status", "sensor_manufacturer", "sensor_use_status",
        "control_manufacturer", "utilization_band", "peak_period", "primary_users", "user_notes",
        "new_sensor_target_count", "gateway_target_count", "display_development_possible",
        "portal_link_possible", "power_supply_status", "wired_network_status", "windows_update_status",
        "priority_rank", "priority_score", "priority_note", "source_pages", "raw_survey_data",
    )
    fact_values: list[str] = []
    for lot in lots:
        sections = lot["sections"]
        values = {
            "lot_code": lot["code"],
            "source_record_no": lot["source_record_no"],
            "general_spaces": lot["general_spaces"],
            "other_space_type": lot["other_space_type"],
            "operation_category": sections["hours"]["operation_category"],
            "operating_hours_text": sections["hours"]["operating_hours_text"],
            "management_type": sections["staff"]["management_type"],
            "resident_staff_count": to_int(sections["staff"]["resident_staff_count"]),
            "control_system_linked": sections["integration"]["control_system_status"] == "연계",
            "parking_portal_linked": sections["integration"]["parking_portal_status"] == "연계",
            "display_installation_status": sections["display"]["display_installation_status"],
            "display_network_type": sections["display"]["display_network_type"] or None,
            "display_use_status": sections["display"]["display_use_status"] or None,
            "entrance_count": to_int(sections["access"]["entrance_count"]),
            "exit_count": to_int(sections["access"]["exit_count"]),
            "entrance_exit_shared": sections["access"]["entrance_exit_shared"].upper() == "O",
            "existing_sensor_status": sections["sensor"]["existing_sensor_status"],
            "sensor_manufacturer": sections["sensor"]["sensor_manufacturer"] or None,
            "sensor_use_status": sections["sensor"]["sensor_use_status"] or "미사용",
            "control_manufacturer": sections["control_vendor"]["control_manufacturer"],
            "utilization_band": sections["utilization"]["utilization_band"],
            "peak_period": sections["utilization"]["peak_period"],
            "primary_users": sections["utilization"]["primary_users"],
            "user_notes": sections["utilization"]["user_notes"] or None,
            "new_sensor_target_count": to_int(sections["sensor_plan"]["new_sensor_target_count"]),
            "gateway_target_count": to_int(sections["sensor_plan"]["gateway_target_count"]),
            "display_development_possible": sections["sensor_plan"]["display_development_possible"],
            "portal_link_possible": sections["sensor_plan"]["portal_link_possible"],
            "power_supply_status": sections["environment"]["power_supply_status"],
            "wired_network_status": sections["environment"]["wired_network_status"],
            "windows_update_status": sections["environment"]["windows_update_status"],
            "priority_rank": sections["priority"]["section_id"],
            "priority_score": to_int(sections["priority"]["priority_score"]),
            "priority_note": sections["priority"]["priority_note"] or None,
            "source_pages": lot["source_pages"],
            "raw_survey_data": sections,
        }
        rendered = [
            sql_json(values[column]) if column in {"source_pages", "raw_survey_data"} else sql_quote(values[column])
            for column in fact_columns
        ]
        fact_values.append("  (" + ", ".join(rendered) + ")")

    return f"""-- Generated by tools/build_jeju_survey_seed.py. Do not edit by hand.
-- Source SHA-256: {source['source_sha256']}

INSERT INTO public.survey_data_sources (
  id, source_code, title, publisher, contractor, report_month, source_filename,
  source_sha256, source_page_count, record_count, declared_totals, observed_totals,
  discrepancies, validation_status, validated_at
) VALUES (
  {sql_quote(SOURCE_ID)}::uuid,
  {sql_quote(SOURCE_CODE)},
  {sql_quote(source['title'])},
  {sql_quote(source['publisher'])},
  {sql_quote(source['contractor'])},
  DATE '2025-12-01',
  {sql_quote(source['source_filename'])},
  {sql_quote(source['source_sha256'])},
  84,
  112,
  {sql_json({'report_narrative': validation['space_totals'], 'conflicting_table_heading_pdf_page_18': {'total_spaces': 6300, 'general_spaces': 5292}})},
  {sql_json(validation)},
  {sql_json(discrepancies)},
  'validated',
  now()
) ON CONFLICT (source_code) DO UPDATE SET
  title = EXCLUDED.title,
  publisher = EXCLUDED.publisher,
  contractor = EXCLUDED.contractor,
  report_month = EXCLUDED.report_month,
  source_filename = EXCLUDED.source_filename,
  source_sha256 = EXCLUDED.source_sha256,
  source_page_count = EXCLUDED.source_page_count,
  record_count = EXCLUDED.record_count,
  declared_totals = EXCLUDED.declared_totals,
  observed_totals = EXCLUDED.observed_totals,
  discrepancies = EXCLUDED.discrepancies,
  validation_status = EXCLUDED.validation_status,
  validated_at = EXCLUDED.validated_at;

-- Explicitly requested destructive replacement: remove the previous parking-lot
-- dataset and every lot-dependent operational row, while preserving auth,
-- profiles, configuration, code tables, and module licenses.
TRUNCATE TABLE public.parking_lots RESTART IDENTITY CASCADE;

INSERT INTO public.parking_lots ({', '.join(lot_columns)}) VALUES
{',\n'.join(lot_values)};

WITH survey_rows ({', '.join(fact_columns)}) AS (
  VALUES
{',\n'.join(fact_values)}
)
INSERT INTO public.parking_lot_survey_facts (
  lot_id, source_id, {', '.join(fact_columns[1:])}
)
SELECT
  lot.id,
  (SELECT id FROM public.survey_data_sources WHERE source_code = {sql_quote(SOURCE_CODE)}),
  {', '.join('survey_rows.' + column for column in fact_columns[1:])}
FROM survey_rows
JOIN public.parking_lots lot ON lot.code = survey_rows.lot_code;

DO $$
DECLARE
  actual jsonb;
BEGIN
  SELECT jsonb_build_object(
    'record_count', count(*),
    'total_spaces', sum(total_spaces),
    'disabled_spaces', sum(disabled_spaces),
    'ev_spaces', sum(ev_spaces),
    'compact_spaces', sum(compact_spaces),
    'pregnant_spaces', sum(pregnant_spaces),
    'other_spaces', sum(other_spaces)
  ) INTO actual
  FROM public.parking_lots;

  IF actual <> '{{"record_count":112,"total_spaces":6380,"disabled_spaces":287,"ev_spaces":161,"compact_spaces":510,"pregnant_spaces":10,"other_spaces":54}}'::jsonb THEN
    RAISE EXCEPTION 'Jeju survey parking-lot validation failed: %', actual;
  END IF;

  IF (SELECT count(*) FROM public.parking_lot_survey_facts) <> 112 THEN
    RAISE EXCEPTION 'Jeju survey facts must contain exactly 112 rows';
  END IF;
  IF (SELECT sum(general_spaces) FROM public.parking_lot_survey_facts) <> 5358 THEN
    RAISE EXCEPTION 'Jeju survey general-space total must equal 5,358';
  END IF;
  IF (SELECT sum(new_sensor_target_count) FROM public.parking_lot_survey_facts) <> 3857 THEN
    RAISE EXCEPTION 'Jeju survey sensor target total must equal 3,857';
  END IF;
  IF (SELECT sum(gateway_target_count) FROM public.parking_lot_survey_facts) <> 99 THEN
    RAISE EXCEPTION 'Jeju survey detail-row gateway total must equal 99';
  END IF;
END;
$$;
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", type=Path, help="Path to the supplied 84-page survey PDF")
    parser.add_argument(
        "--json-output", type=Path,
        default=Path("supabase/seed_data/jeju_paid_parking_2025.json"),
    )
    parser.add_argument(
        "--sql-output", type=Path,
        default=Path("supabase/migrations/20260730101000_jeju_paid_parking_rebuild.sql"),
    )
    args = parser.parse_args()

    pdf_path = find_pdf(args.pdf)
    dataset = build_dataset(pdf_path)
    args.json_output.parent.mkdir(parents=True, exist_ok=True)
    args.sql_output.parent.mkdir(parents=True, exist_ok=True)
    args.json_output.write_text(json.dumps(dataset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.sql_output.write_text(render_sql(dataset), encoding="utf-8")
    print(json.dumps(dataset["validation"], ensure_ascii=False, indent=2))
    print(f"Wrote {args.json_output}")
    print(f"Wrote {args.sql_output}")


if __name__ == "__main__":
    main()
