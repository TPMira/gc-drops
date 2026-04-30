import argparse
import json
import os
import random
import uuid
import re
import statistics
import time
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import mss
import numpy as np


CONFIG_DEFAULT = "item_registry_config.json"
DEFAULT_DROPS_LOG = "output/drops_log.json"
DEFAULT_RUNS_LOG = "output/runs.json"


# ── Zoomable ROI selector ──────────────────────────────────────────────
def zoomable_select_roi(
    image: np.ndarray,
    title: str = "Select ROI",
    *,
    zoom_step: float = 1.25,
    max_zoom: float = 10.0,
) -> Tuple[int, int, int, int]:
    """Interactive ROI selector with scroll-to-zoom and middle-click pan.

    Controls:
        Scroll wheel    — zoom in / out (centered on cursor)
        Middle-drag     — pan the view
        Left-drag       — draw selection rectangle
        ENTER / SPACE   — confirm selection
        ESC             — cancel (returns 0,0,0,0)
        R               — reset zoom to fit
        +/-             — zoom in/out (keyboard)
    """
    src = image.copy()
    h_src, w_src = src.shape[:2]

    state: Dict[str, Any] = {
        "zoom": 1.0,
        "ox": 0.0,        # offset x (in source coords) of the top-left visible pixel
        "oy": 0.0,        # offset y
        "dragging": False,
        "pan": False,
        "pan_start": None,
        "pan_ox": 0.0,
        "pan_oy": 0.0,
        "x1": -1, "y1": -1, "x2": -1, "y2": -1,  # selection in source coords
        "done": False,
        "confirmed": False,
        "win_w": min(w_src, 1600),
        "win_h": min(h_src, 900),
    }

    def _clamp_offset() -> None:
        z = state["zoom"]
        vis_w = state["win_w"] / z
        vis_h = state["win_h"] / z
        state["ox"] = max(0.0, min(float(w_src) - vis_w, state["ox"]))
        state["oy"] = max(0.0, min(float(h_src) - vis_h, state["oy"]))

    def _screen_to_src(sx: int, sy: int) -> Tuple[float, float]:
        z = state["zoom"]
        return state["ox"] + sx / z, state["oy"] + sy / z

    def _render() -> np.ndarray:
        z = state["zoom"]
        vis_w = int(state["win_w"] / z)
        vis_h = int(state["win_h"] / z)
        ox, oy = int(state["ox"]), int(state["oy"])
        # Clamp crop region.
        cx2 = min(w_src, ox + vis_w)
        cy2 = min(h_src, oy + vis_h)
        cx1 = max(0, cx2 - vis_w)
        cy1 = max(0, cy2 - vis_h)
        crop = src[cy1:cy2, cx1:cx2]
        disp = cv2.resize(crop, (state["win_w"], state["win_h"]), interpolation=cv2.INTER_LINEAR)

        # Draw selection rectangle.
        if state["x1"] >= 0 and state["y1"] >= 0:
            sx1 = int((state["x1"] - cx1) * z)
            sy1 = int((state["y1"] - cy1) * z)
            sx2 = int((state["x2"] - cx1) * z) if state["x2"] >= 0 else sx1
            sy2 = int((state["y2"] - cy1) * z) if state["y2"] >= 0 else sy1
            cv2.rectangle(disp, (sx1, sy1), (sx2, sy2), (0, 255, 0), 2)

        # Crosshair at cursor if not dragging.
        # HUD
        z_pct = int(z * 100)
        cv2.putText(disp, f"Zoom: {z_pct}% | Scroll=zoom | Mid-drag=pan | R=reset | ENTER=ok | ESC=cancel",
                    (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1, cv2.LINE_AA)
        return disp

    def _on_mouse(event: int, mx: int, my: int, flags: int, _: Any) -> None:
        if state["done"]:
            return

        # Middle button pan.
        if event == cv2.EVENT_MBUTTONDOWN:
            state["pan"] = True
            state["pan_start"] = (mx, my)
            state["pan_ox"] = state["ox"]
            state["pan_oy"] = state["oy"]
            return
        if event == cv2.EVENT_MBUTTONUP:
            state["pan"] = False
            return
        if event == cv2.EVENT_MOUSEMOVE and state["pan"]:
            dx = mx - state["pan_start"][0]
            dy = my - state["pan_start"][1]
            z = state["zoom"]
            state["ox"] = state["pan_ox"] - dx / z
            state["oy"] = state["pan_oy"] - dy / z
            _clamp_offset()
            return

        # Left button selection.
        if event == cv2.EVENT_LBUTTONDOWN:
            sx, sy = _screen_to_src(mx, my)
            state["x1"] = int(sx)
            state["y1"] = int(sy)
            state["x2"] = int(sx)
            state["y2"] = int(sy)
            state["dragging"] = True
            return
        if event == cv2.EVENT_MOUSEMOVE and state["dragging"]:
            sx, sy = _screen_to_src(mx, my)
            state["x2"] = int(max(0, min(w_src, sx)))
            state["y2"] = int(max(0, min(h_src, sy)))
            return
        if event == cv2.EVENT_LBUTTONUP:
            if state["dragging"]:
                sx, sy = _screen_to_src(mx, my)
                state["x2"] = int(max(0, min(w_src, sx)))
                state["y2"] = int(max(0, min(h_src, sy)))
                state["dragging"] = False
            return

        # Scroll zoom.
        if event == cv2.EVENT_MOUSEWHEEL:
            old_z = state["zoom"]
            if flags > 0:
                new_z = min(max_zoom, old_z * zoom_step)
            else:
                new_z = max(0.1, old_z / zoom_step)
            # Zoom centered on cursor.
            src_x, src_y = _screen_to_src(mx, my)
            state["zoom"] = new_z
            state["ox"] = src_x - mx / new_z
            state["oy"] = src_y - my / new_z
            _clamp_offset()

    cv2.namedWindow(title, cv2.WINDOW_AUTOSIZE)
    cv2.setMouseCallback(title, _on_mouse)

    while not state["done"]:
        disp = _render()
        cv2.imshow(title, disp)
        k = cv2.waitKey(30) & 0xFF
        if k == 27:  # ESC
            state["done"] = True
            state["confirmed"] = False
        elif k in (13, 32):  # ENTER or SPACE
            state["done"] = True
            state["confirmed"] = True
        elif k == ord("r") or k == ord("R"):
            state["zoom"] = 1.0
            state["ox"] = 0.0
            state["oy"] = 0.0
        elif k == ord("+") or k == ord("="):
            state["zoom"] = min(max_zoom, state["zoom"] * zoom_step)
            _clamp_offset()
        elif k == ord("-") or k == ord("_"):
            state["zoom"] = max(0.1, state["zoom"] / zoom_step)
            _clamp_offset()

    cv2.destroyWindow(title)

    if not state["confirmed"] or state["x1"] < 0 or state["y1"] < 0:
        return (0, 0, 0, 0)

    lx = min(state["x1"], state["x2"])
    ly = min(state["y1"], state["y2"])
    rx = max(state["x1"], state["x2"])
    ry = max(state["y1"], state["y2"])
    w = rx - lx
    h = ry - ly
    if w <= 0 or h <= 0:
        return (0, 0, 0, 0)
    return (lx, ly, w, h)


def _next_template_index(templates_dir: Path, base: str, *, max_n: int = 1000) -> int:
    """Return the next available 1..max_n index for files like '<base>_<n>.*'.

    Supports optional position suffix: '<base>_<n>_r<row>_c<col>.<ext>'.
    """
    if max_n < 1:
        max_n = 1000

    pat = re.compile(
        rf"^{re.escape(base)}_(\\d+)(?:_r\\d+_c\\d+)?\\.(png|jpg|jpeg)$",
        re.IGNORECASE,
    )
    used: set[int] = set()

    if templates_dir.exists():
        for p in templates_dir.iterdir():
            if not p.is_file():
                continue
            m = pat.match(p.name)
            if not m:
                continue
            try:
                n = int(m.group(1))
            except ValueError:
                continue
            if 1 <= n <= max_n:
                used.add(n)

    for n in range(1, max_n + 1):
        if n not in used:
            return n
    return max_n + 1


def _template_index_used(templates_dir: Path, base: str, idx: int) -> bool:
    """True if any file exists for the given base+index, with or without r/c suffix."""
    if not templates_dir.exists():
        return False
    idx = int(idx)
    pat = re.compile(
        rf"^{re.escape(base)}_{idx}(?:_r\\d+_c\\d+)?\\.(png|jpg|jpeg)$",
        re.IGNORECASE,
    )
    for p in templates_dir.iterdir():
        if not p.is_file():
            continue
        if pat.match(p.name):
            return True
    return False


def _iso_utc(ts: float) -> str:
    # ISO 8601 with milliseconds, always UTC.
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _make_run_id(ts: float) -> str:
    return f"run_{int(ts * 1000)}_{random.randint(100, 999)}"


@dataclass(frozen=True)
class GridConfig:
    monitor: int
    grid_roi: Tuple[int, int, int, int]  # x, y, w, h
    rows: int
    cols: int
    map_roi: Optional[Tuple[int, int, int, int]] = None  # x, y, w, h (área do nome do mapa)
    slot_inner_roi: Optional[Tuple[int, int, int, int]] = None  # x, y, w, h (ROI dentro do slot, relativo ao slot)
    slot_rois: Optional[Dict[str, Tuple[int, int, int, int]]] = None  # key=r{row}c{col} -> x,y,w,h (relativo ao slot)
    slot_rois_abs: Optional[Dict[str, Tuple[int, int, int, int]]] = None  # key=r{row}c{col} -> x,y,w,h (absoluto na tela)
    global_trim: Optional[Tuple[int, int, int, int]] = None  # left, top, right, bottom (px)
    row_trims: Optional[List[Tuple[int, int]]] = None  # per-row (top_trim_px, bottom_trim_px)
    cell_pad: int = 4
    empty_stddev_threshold: float = 10.0
    template_threshold: float = 0.78
    map_threshold: float = 0.80
    calibrated_resolution: Optional[Tuple[int, int]] = None  # (width, height) quando foi calibrado


def _bgr_from_mss_shot(shot: Any) -> np.ndarray:
    # mss returns BGRA.
    arr = np.asarray(shot)
    return arr[:, :, :3].copy()


def crop_roi(frame_bgr: np.ndarray, roi: Tuple[int, int, int, int]) -> np.ndarray:
    x, y, w, h = roi
    screen_h, screen_w = frame_bgr.shape[:2]
    x1 = max(0, min(screen_w - 1, int(x)))
    y1 = max(0, min(screen_h - 1, int(y)))
    x2 = max(x1 + 1, min(screen_w, int(x + w)))
    y2 = max(y1 + 1, min(screen_h, int(y + h)))
    return frame_bgr[y1:y2, x1:x2]


def get_screen_resolution(monitor: int) -> Tuple[int, int]:
    """Return (width, height) of the given monitor."""
    with mss.mss() as sct:
        monitors = sct.monitors
        if monitor < 0 or monitor >= len(monitors):
            raise SystemExit(f"Monitor index {monitor} inválido.")
        m = monitors[monitor]
        return int(m["width"]), int(m["height"])


def _scale_roi4(
    roi: Tuple[int, int, int, int], sx: float, sy: float
) -> Tuple[int, int, int, int]:
    return (int(round(roi[0] * sx)), int(round(roi[1] * sy)),
            int(round(roi[2] * sx)), int(round(roi[3] * sy)))


def _scale_trim4(
    trim: Tuple[int, int, int, int], sx: float, sy: float
) -> Tuple[int, int, int, int]:
    # left, top, right, bottom
    return (max(0, int(round(trim[0] * sx))), max(0, int(round(trim[1] * sy))),
            max(0, int(round(trim[2] * sx))), max(0, int(round(trim[3] * sy))))


def scale_config_to_resolution(
    cfg: GridConfig, target_w: int, target_h: int
) -> GridConfig:
    """Scale all pixel coordinates from calibrated_resolution to target resolution.

    If calibrated_resolution is not set or matches target, returns cfg unchanged.
    """
    cal = cfg.calibrated_resolution
    if cal is None:
        return cfg
    cal_w, cal_h = cal
    if cal_w == target_w and cal_h == target_h:
        return cfg
    if cal_w <= 0 or cal_h <= 0:
        return cfg

    sx = target_w / cal_w
    sy = target_h / cal_h

    new_grid_roi = _scale_roi4(cfg.grid_roi, sx, sy)
    new_map_roi = _scale_roi4(cfg.map_roi, sx, sy) if cfg.map_roi else None
    new_slot_inner_roi = _scale_roi4(cfg.slot_inner_roi, sx, sy) if cfg.slot_inner_roi else None

    new_slot_rois: Optional[Dict[str, Tuple[int, int, int, int]]] = None
    if cfg.slot_rois:
        new_slot_rois = {k: _scale_roi4(v, sx, sy) for k, v in cfg.slot_rois.items()}

    new_slot_rois_abs: Optional[Dict[str, Tuple[int, int, int, int]]] = None
    if cfg.slot_rois_abs:
        new_slot_rois_abs = {k: _scale_roi4(v, sx, sy) for k, v in cfg.slot_rois_abs.items()}

    new_global_trim = _scale_trim4(cfg.global_trim, sx, sy) if cfg.global_trim else None

    new_row_trims: Optional[List[Tuple[int, int]]] = None
    if cfg.row_trims:
        new_row_trims = [(max(0, int(round(t * sy))), max(0, int(round(b * sy)))) for t, b in cfg.row_trims]

    new_cell_pad = max(0, int(round(cfg.cell_pad * min(sx, sy))))

    print(
        f"Auto-scale: calibrado em {cal_w}x{cal_h}, rodando em {target_w}x{target_h} "
        f"(scale: {sx:.3f}x{sy:.3f})"
    )

    return replace(
        cfg,
        grid_roi=new_grid_roi,
        map_roi=new_map_roi,
        slot_inner_roi=new_slot_inner_roi,
        slot_rois=new_slot_rois,
        slot_rois_abs=new_slot_rois_abs,
        global_trim=new_global_trim,
        row_trims=new_row_trims,
        cell_pad=new_cell_pad,
        calibrated_resolution=(target_w, target_h),
    )


def capture_screen(monitor: int) -> np.ndarray:
    with mss.mss() as sct:
        monitors = sct.monitors
        if monitor < 0 or monitor >= len(monitors):
            raise SystemExit(
                f"Monitor index {monitor} inválido. Use --list-monitors para ver opções."
            )
        shot = sct.grab(monitors[monitor])
        return _bgr_from_mss_shot(shot)


def list_monitors() -> None:
    with mss.mss() as sct:
        for i, m in enumerate(sct.monitors):
            if i == 0:
                print(f"[{i}] ALL: {m}")
            else:
                print(f"[{i}] {m}")


def select_roi(bgr: np.ndarray, title: str) -> Tuple[int, int, int, int]:
    x, y, w, h = zoomable_select_roi(bgr, title)
    if w == 0 or h == 0:
        raise SystemExit("ROI cancelada. Rode novamente e selecione uma área.")
    return int(x), int(y), int(w), int(h)


def _parse_roi4(value: Any) -> Optional[Tuple[int, int, int, int]]:
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        return None
    try:
        x = int(round(float(value[0])))
        y = int(round(float(value[1])))
        w = int(round(float(value[2])))
        h = int(round(float(value[3])))
    except (TypeError, ValueError):
        return None
    if w <= 0 or h <= 0:
        return None
    return (x, y, w, h)


def load_config(path: Path) -> GridConfig:
    data = json.loads(path.read_text(encoding="utf-8"))

    slot_rois_raw = data.get("slot_rois")
    slot_rois: Optional[Dict[str, Tuple[int, int, int, int]]] = None
    if isinstance(slot_rois_raw, dict):
        parsed: Dict[str, Tuple[int, int, int, int]] = {}
        for k, v in slot_rois_raw.items():
            if not isinstance(k, str):
                continue
            if isinstance(v, (list, tuple)) and len(v) == 4:
                try:
                    parsed[k] = (int(v[0]), int(v[1]), int(v[2]), int(v[3]))
                except (TypeError, ValueError):
                    continue
        slot_rois = parsed if parsed else None

    slot_rois_abs_raw = data.get("slot_rois_abs")
    slot_rois_abs: Optional[Dict[str, Tuple[int, int, int, int]]] = None
    if isinstance(slot_rois_abs_raw, dict):
        parsed_abs: Dict[str, Tuple[int, int, int, int]] = {}
        for k, v in slot_rois_abs_raw.items():
            if not isinstance(k, str):
                continue
            if isinstance(v, (list, tuple)) and len(v) == 4:
                try:
                    parsed_abs[k] = (int(v[0]), int(v[1]), int(v[2]), int(v[3]))
                except (TypeError, ValueError):
                    continue
        slot_rois_abs = parsed_abs if parsed_abs else None

    row_trims_raw = data.get("row_trims")
    row_trims: Optional[List[Tuple[int, int]]] = None
    if isinstance(row_trims_raw, list):
        parsed_trims: List[Tuple[int, int]] = []
        for v in row_trims_raw:
            if isinstance(v, (list, tuple)) and len(v) == 2:
                try:
                    top = max(0, int(v[0]))
                    bottom = max(0, int(v[1]))
                except (TypeError, ValueError):
                    top, bottom = 0, 0
                parsed_trims.append((top, bottom))
        row_trims = parsed_trims if parsed_trims else None

    global_trim_raw = data.get("global_trim")
    global_trim: Optional[Tuple[int, int, int, int]] = None
    if isinstance(global_trim_raw, (list, tuple)) and len(global_trim_raw) == 4:
        try:
            l = max(0, int(global_trim_raw[0]))
            t = max(0, int(global_trim_raw[1]))
            r = max(0, int(global_trim_raw[2]))
            b = max(0, int(global_trim_raw[3]))
            global_trim = (l, t, r, b)
        except (TypeError, ValueError):
            global_trim = None

    grid_roi = _parse_roi4(data.get("grid_roi"))
    if grid_roi is None:
        raise SystemExit("Config inválida: grid_roi ausente ou inválido.")

    # --- calibrated_resolution ---
    cal_res_raw = data.get("calibrated_resolution")
    calibrated_resolution: Optional[Tuple[int, int]] = None
    if isinstance(cal_res_raw, (list, tuple)) and len(cal_res_raw) == 2:
        try:
            calibrated_resolution = (int(cal_res_raw[0]), int(cal_res_raw[1]))
        except (TypeError, ValueError):
            calibrated_resolution = None

    return GridConfig(
        monitor=int(data["monitor"]),
        grid_roi=grid_roi,
        map_roi=(_parse_roi4(data.get("map_roi")) if data.get("map_roi") else None),
        slot_inner_roi=(_parse_roi4(data.get("slot_inner_roi")) if data.get("slot_inner_roi") else None),
        slot_rois=slot_rois,
        slot_rois_abs=slot_rois_abs,
        global_trim=global_trim,
        row_trims=row_trims,
        rows=int(data["rows"]),
        cols=int(data["cols"]),
        cell_pad=int(data.get("cell_pad", 4)),
        empty_stddev_threshold=float(data.get("empty_stddev_threshold", 10.0)),
        template_threshold=float(data.get("template_threshold", 0.78)),
        map_threshold=float(data.get("map_threshold", 0.80)),
        calibrated_resolution=calibrated_resolution,
    )


def save_config(path: Path, cfg: GridConfig) -> None:
    slot_rois_out: Optional[Dict[str, List[int]]] = None
    if cfg.slot_rois:
        slot_rois_out = {k: [int(v[0]), int(v[1]), int(v[2]), int(v[3])] for k, v in cfg.slot_rois.items()}

    slot_rois_abs_out: Optional[Dict[str, List[int]]] = None
    if cfg.slot_rois_abs:
        slot_rois_abs_out = {k: [int(v[0]), int(v[1]), int(v[2]), int(v[3])] for k, v in cfg.slot_rois_abs.items()}

    row_trims_out: Optional[List[List[int]]] = None
    if cfg.row_trims:
        row_trims_out = [[int(t), int(b)] for (t, b) in cfg.row_trims]

    global_trim_out: Optional[List[int]] = None
    if cfg.global_trim is not None:
        global_trim_out = [int(cfg.global_trim[0]), int(cfg.global_trim[1]), int(cfg.global_trim[2]), int(cfg.global_trim[3])]

    data: Dict[str, Any] = {
        "monitor": cfg.monitor,
        "grid_roi": list(cfg.grid_roi),
        "map_roi": (list(cfg.map_roi) if cfg.map_roi is not None else None),
        "slot_inner_roi": (list(cfg.slot_inner_roi) if cfg.slot_inner_roi is not None else None),
        "slot_rois": slot_rois_out,
        "slot_rois_abs": slot_rois_abs_out,
        "global_trim": global_trim_out,
        "row_trims": row_trims_out,
        "rows": cfg.rows,
        "cols": cfg.cols,
        "cell_pad": cfg.cell_pad,
        "empty_stddev_threshold": cfg.empty_stddev_threshold,
        "template_threshold": cfg.template_threshold,
        "map_threshold": cfg.map_threshold,
        "calibrated_resolution": list(cfg.calibrated_resolution) if cfg.calibrated_resolution else None,
    }
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _apply_row_trim(slot_bgr: np.ndarray, top: int, bottom: int) -> np.ndarray:
    top = max(0, int(top))
    bottom = max(0, int(bottom))
    h, w = slot_bgr.shape[:2]
    if top == 0 and bottom == 0:
        return slot_bgr
    if top + bottom >= h - 2:
        return slot_bgr
    return slot_bgr[top : h - bottom, :]


def _apply_global_trim(slot_bgr: np.ndarray, trim: Tuple[int, int, int, int]) -> np.ndarray:
    l, t, r, b = (max(0, int(trim[0])), max(0, int(trim[1])), max(0, int(trim[2])), max(0, int(trim[3])))
    h, w = slot_bgr.shape[:2]
    if l == 0 and t == 0 and r == 0 and b == 0:
        return slot_bgr
    if l + r >= w - 2 or t + b >= h - 2:
        return slot_bgr
    return slot_bgr[t : h - b, l : w - r]


def _parse_trim4_spec(spec: str) -> Tuple[int, int, int, int]:
    parts = [p.strip() for p in str(spec).split(",")]
    if len(parts) != 4:
        raise ValueError("expected 'left,top,right,bottom'")
    l = max(0, int(parts[0]))
    t = max(0, int(parts[1]))
    r = max(0, int(parts[2]))
    b = max(0, int(parts[3]))
    return (l, t, r, b)


def _parse_row_trims_spec(spec: str) -> List[Tuple[int, int]]:
    """Parse 'top,bottom;top,bottom;...' into a list of (top,bottom)."""
    out: List[Tuple[int, int]] = []
    for part in [p.strip() for p in str(spec).split(";") if p.strip()]:
        nums = [x.strip() for x in part.split(",")]
        if len(nums) != 2:
            raise ValueError("row trim spec must be 'top,bottom' per row")
        top = max(0, int(nums[0]))
        bottom = max(0, int(nums[1]))
        out.append((top, bottom))
    if not out:
        raise ValueError("empty row trim spec")
    return out


def _split_sizes(total: int, parts: int) -> List[int]:
    if parts <= 0:
        raise ValueError("parts must be > 0")
    if total <= 0:
        raise ValueError("total must be > 0")

    base = total // parts
    rem = total % parts
    # Distribute remainder to the first cells to avoid cumulative rounding drift.
    return [base + (1 if i < rem else 0) for i in range(parts)]


def iter_cells(cfg: GridConfig, *, pad_override: Optional[int] = None) -> List[Tuple[int, int, int, int, int, int]]:
    x0, y0, w, h = cfg.grid_roi

    col_sizes = _split_sizes(int(w), int(cfg.cols))
    row_sizes = _split_sizes(int(h), int(cfg.rows))

    x_edges = [int(x0)]
    for s in col_sizes:
        x_edges.append(x_edges[-1] + int(s))

    y_edges = [int(y0)]
    for s in row_sizes:
        y_edges.append(y_edges[-1] + int(s))

    cells: List[Tuple[int, int, int, int, int, int]] = []
    for r in range(cfg.rows):
        for c in range(cfg.cols):
            x1 = x_edges[c]
            x2 = x_edges[c + 1]
            y1 = y_edges[r]
            y2 = y_edges[r + 1]

            # pad > 0  -> crops inward (removes borders)
            # pad == 0 -> exact cell
            # pad < 0  -> expands outward (includes borders/margins)
            pad = int(cfg.cell_pad if pad_override is None else pad_override)
            x1p = x1 + pad
            y1p = y1 + pad
            x2p = x2 - pad
            y2p = y2 - pad

            cells.append((r, c, x1p, y1p, x2p, y2p))
    return cells


def _clamp_roi_to_frame(
    roi: Tuple[int, int, int, int], frame_shape: Tuple[int, int, int]
) -> Tuple[int, int, int, int]:
    x, y, w, h = roi
    H, W = frame_shape[:2]
    x = max(0, min(W - 2, int(x)))
    y = max(0, min(H - 2, int(y)))
    w = max(2, min(W - x, int(w)))
    h = max(2, min(H - y, int(h)))
    return x, y, w, h


def _expand_roi(
    roi: Tuple[int, int, int, int], margin: int, frame_shape: Tuple[int, int, int]
) -> Tuple[int, int, int, int]:
    x, y, w, h = roi
    m = max(0, int(margin))
    x2, y2 = x + w, y + h
    x = x - m
    y = y - m
    x2 = x2 + m
    y2 = y2 + m
    H, W = frame_shape[:2]
    x = max(0, min(W - 2, int(x)))
    y = max(0, min(H - 2, int(y)))
    x2 = max(x + 2, min(W, int(x2)))
    y2 = max(y + 2, min(H, int(y2)))
    return x, y, int(x2 - x), int(y2 - y)


def _smooth_1d(values: np.ndarray, win: int = 9) -> np.ndarray:
    if win <= 1:
        return values
    win = int(win)
    if values.size < win:
        return values
    k = np.ones(win, dtype=np.float32) / float(win)
    return np.convolve(values.astype(np.float32), k, mode="same")


def snap_grid_roi_from_edges(
    frame_bgr: np.ndarray,
    approx_roi: Tuple[int, int, int, int],
    *,
    margin: int = 30,
) -> Tuple[Tuple[int, int, int, int], Dict[str, Any]]:
    """Snap an approximate grid ROI to the nearest strong rectangle borders.

    This is meant to correct small "by eye" errors (1-20px). It works by searching
    for peak edge energy near the current ROI borders.
    """
    approx_roi = _clamp_roi_to_frame(approx_roi, frame_bgr.shape)
    search_roi = _expand_roi(approx_roi, margin, frame_bgr.shape)
    sx, sy, sw, sh = search_roi
    region = crop_roi(frame_bgr, search_roi)
    gray = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)

    # Edge energy profiles
    sobx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    soby = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    v = np.sum(np.abs(sobx), axis=0)
    h = np.sum(np.abs(soby), axis=1)
    v = _smooth_1d(v, win=11)
    h = _smooth_1d(h, win=11)

    W = int(region.shape[1])
    H = int(region.shape[0])
    x0_rel = int(approx_roi[0] - sx)
    x1_rel = int(approx_roi[0] + approx_roi[2] - 1 - sx)
    y0_rel = int(approx_roi[1] - sy)
    y1_rel = int(approx_roi[1] + approx_roi[3] - 1 - sy)

    def _best_near(profile: np.ndarray, target: int, radius: int) -> int:
        t = int(target)
        r = max(3, int(radius))
        lo = max(0, t - r)
        hi = min(profile.size - 1, t + r)
        if hi <= lo:
            return max(0, min(profile.size - 1, t))

        window = profile[lo : hi + 1]
        # Prefer peaks closer to the target border.
        dist = np.abs(np.arange(lo, hi + 1) - t).astype(np.float32)
        penalty = (0.15 * float(window.max() + 1e-6)) * (dist / float(r))
        score = window - penalty
        return int(lo + int(np.argmax(score)))

    rad_x = max(int(W * 0.08), 18)
    rad_y = max(int(H * 0.10), 18)

    left = _best_near(v, x0_rel, rad_x)
    right = _best_near(v, x1_rel, rad_x)
    top = _best_near(h, y0_rel, rad_y)
    bottom = _best_near(h, y1_rel, rad_y)

    # Sanity clamp: ensure a valid rectangle; fallback to approx if detection is nonsense.
    if right - left < 50 or bottom - top < 50:
        return approx_roi, {
            "approx_roi": approx_roi,
            "search_roi": search_roi,
            "snapped": False,
            "reason": "invalid detected size",
        }

    new_roi = (int(sx + left), int(sy + top), int(right - left + 1), int(bottom - top + 1))
    new_roi = _clamp_roi_to_frame(new_roi, frame_bgr.shape)
    return new_roi, {
        "approx_roi": approx_roi,
        "search_roi": search_roi,
        "snapped": True,
        "left": int(left),
        "right": int(right),
        "top": int(top),
        "bottom": int(bottom),
    }


def _median_int(values: List[int]) -> int:
    if not values:
        raise ValueError("empty values")
    return int(round(float(statistics.median(values))))


def _robust_median_roi(rois: List[Tuple[int, int, int, int]]) -> Tuple[int, int, int, int]:
    if not rois:
        raise ValueError("no rois")

    xs = [r[0] for r in rois]
    ys = [r[1] for r in rois]
    ws = [r[2] for r in rois]
    hs = [r[3] for r in rois]

    mx, my, mw, mh = _median_int(xs), _median_int(ys), _median_int(ws), _median_int(hs)

    def _mad(vals: List[int], med: int) -> float:
        if not vals:
            return 0.0
        dev = [abs(v - med) for v in vals]
        return float(statistics.median(dev))

    madx, mady, madw, madh = _mad(xs, mx), _mad(ys, my), _mad(ws, mw), _mad(hs, mh)

    # Filter outliers using a loose MAD rule; keep all if MAD is ~0.
    filtered: List[Tuple[int, int, int, int]] = []
    for x, y, w, h in rois:
        ok = True
        if madx > 0 and abs(x - mx) > 4 * madx:
            ok = False
        if mady > 0 and abs(y - my) > 4 * mady:
            ok = False
        if madw > 0 and abs(w - mw) > 4 * madw:
            ok = False
        if madh > 0 and abs(h - mh) > 4 * madh:
            ok = False
        if ok:
            filtered.append((x, y, w, h))

    base = filtered if len(filtered) >= max(3, len(rois) // 2) else rois
    return (
        _median_int([r[0] for r in base]),
        _median_int([r[1] for r in base]),
        _median_int([r[2] for r in base]),
        _median_int([r[3] for r in base]),
    )


def _detect_inner_rect_from_slot(slot_bgr: np.ndarray) -> Optional[Tuple[int, int, int, int]]:
    """Attempt to find the consistent inner rectangle inside a slot (relative ROI).

    Works even for empty slots by using UI border lines/contours.
    """
    h, w = slot_bgr.shape[:2]
    if h < 20 or w < 20:
        return None

    def _edges(img_bgr: np.ndarray) -> np.ndarray:
        g = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        g = cv2.GaussianBlur(g, (5, 5), 0)
        e = cv2.Canny(g, 40, 140)
        e = cv2.morphologyEx(e, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8), iterations=2)
        return e

    def _detect_by_projection(img_bgr: np.ndarray) -> Optional[Tuple[int, int, int, int]]:
        e = _edges(img_bgr)
        m = (e > 0).astype(np.uint8)
        row = m.sum(axis=1).astype(np.int32)
        col = m.sum(axis=0).astype(np.int32)

        if row.size < 10 or col.size < 10:
            return None

        # Smooth a bit.
        def _smooth(v: np.ndarray, k: int = 7) -> np.ndarray:
            k = int(k)
            if k < 3:
                return v
            if k % 2 == 0:
                k += 1
            pad = k // 2
            vp = np.pad(v.astype(np.float32), (pad, pad), mode="edge")
            ker = np.ones((k,), dtype=np.float32) / float(k)
            out = np.convolve(vp, ker, mode="valid")
            return out

        row_s = _smooth(row)
        col_s = _smooth(col)

        # Look for the strongest horizontal/vertical edge bands near the borders.
        top_end = max(3, int(0.35 * h))
        bot_start = min(h - 4, int(0.65 * h))
        left_end = max(3, int(0.35 * w))
        right_start = min(w - 4, int(0.65 * w))

        top_idx = int(np.argmax(row_s[:top_end]))
        bot_idx = int(np.argmax(row_s[bot_start:]) + bot_start)
        left_idx = int(np.argmax(col_s[:left_end]))
        right_idx = int(np.argmax(col_s[right_start:]) + right_start)

        # Require some minimal edge presence.
        if row_s[top_idx] < 0.04 * w or row_s[bot_idx] < 0.04 * w:
            return None
        if col_s[left_idx] < 0.04 * h or col_s[right_idx] < 0.04 * h:
            return None

        x1 = left_idx + 1
        y1 = top_idx + 1
        x2 = right_idx - 1
        y2 = bot_idx - 1
        if x2 <= x1 + 10 or y2 <= y1 + 10:
            return None

        rw = x2 - x1
        rh = y2 - y1

        # Sanity check sizes: inner should be most of the slot, but not full.
        if rw > 0.99 * w or rh > 0.99 * h:
            return None
        if rw < 0.55 * w or rh < 0.55 * h:
            return None

        return int(x1), int(y1), int(rw), int(rh)

    roi_p = _detect_by_projection(slot_bgr)
    if roi_p is not None:
        return roi_p

    edges = _edges(slot_bgr)
    contours, _hier = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    slot_area = float(w * h)
    best: Optional[Tuple[int, int, int, int]] = None
    best_score = -1e9

    cx0, cy0 = w / 2.0, h / 2.0
    for cnt in contours:
        area = float(cv2.contourArea(cnt))
        if area < 0.04 * slot_area:
            continue

        x, y, rw, rh = cv2.boundingRect(cnt)
        if rw < 10 or rh < 10:
            continue

        # Prefer the inner UI box; reject boxes that are basically the full slot.
        if rw > 0.985 * w or rh > 0.985 * h:
            continue
        if rw < 0.55 * w or rh < 0.55 * h:
            continue

        margin = min(x, y, (w - (x + rw)), (h - (y + rh)))
        if margin < 1:
            continue

        fill = area / float(rw * rh)
        fill = max(0.0, min(1.0, fill))

        cx = x + rw / 2.0
        cy = y + rh / 2.0
        dist = ((cx - cx0) ** 2 + (cy - cy0) ** 2) ** 0.5
        dist_norm = dist / (max(w, h) / 2.0)

        size_norm = (rw * rh) / slot_area
        size_norm = max(0.0, min(1.0, size_norm))

        # Heuristic score:
        # - big box
        # - reasonably rectangle-like (fill)
        # - centered
        # - not too close to borders (margin)
        margin_bonus = min(1.0, float(margin) / 12.0)
        score = (0.65 * size_norm + 0.35 * fill) - 0.25 * dist_norm + 0.10 * margin_bonus

        if score > best_score:
            best_score = score
            best = (int(x), int(y), int(rw), int(rh))

    return best


def auto_calculate_slot_inner_roi(
    frame_bgr: np.ndarray,
    cfg: GridConfig,
    *,
    sample_max: Optional[int] = None,
) -> Tuple[Tuple[int, int, int, int], List[Tuple[int, int, Tuple[int, int, int, int]]]]:
    """Derive a stable slot_inner_roi by detecting the inner rectangle across all cells."""
    detections: List[Tuple[int, int, Tuple[int, int, int, int]]] = []
    rois: List[Tuple[int, int, int, int]] = []

    cells = iter_cells(cfg, pad_override=0)
    if sample_max is not None and sample_max > 0:
        cells = cells[: int(sample_max)]

    for r, c, x1, y1, x2, y2 in cells:
        if x2 <= x1 + 5 or y2 <= y1 + 5:
            continue
        slot = frame_bgr[y1:y2, x1:x2]
        roi = _detect_inner_rect_from_slot(slot)
        if roi is None:
            continue
        rois.append(roi)
        detections.append((r, c, roi))

    if len(rois) < 4:
        raise SystemExit(
            "Não consegui detectar o retângulo interno automaticamente (poucas amostras). "
            "Isso normalmente acontece quando a janela não está visível no monitor capturado, "
            "ou quando o grid_roi/cell_pad não batem com o UI atual. "
            "Tente com a janela do Registro de Item aberta e estável, ou use --calibrate-slot-inner-roi."
        )

    roi_med = _robust_median_roi(rois)
    return roi_med, detections


def slot_is_empty(bgr: np.ndarray, stddev_threshold: float) -> bool:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    return float(gray.std()) < stddev_threshold


def load_templates(templates_dir: Path) -> Dict[str, np.ndarray]:
    templates: Dict[str, np.ndarray] = {}
    if not templates_dir.exists():
        return templates

    for p in sorted(templates_dir.glob("*.png")) + sorted(templates_dir.glob("*.jpg")) + sorted(
        templates_dir.glob("*.jpeg")
    ):
        # Avoid polluting item templates with the registry window detector template.
        if p.stem.lower() == "registry_detect":
            continue
        img = cv2.imread(str(p), cv2.IMREAD_COLOR)
        if img is None:
            continue
        templates[p.stem] = img

    return templates


def load_map_templates(maps_dir: Path) -> Dict[str, np.ndarray]:
    templates: Dict[str, np.ndarray] = {}
    if not maps_dir.exists():
        return templates

    for p in sorted(maps_dir.glob("*.png")) + sorted(maps_dir.glob("*.jpg")) + sorted(maps_dir.glob("*.jpeg")):
        img = cv2.imread(str(p), cv2.IMREAD_COLOR)
        if img is None:
            continue
        templates[p.stem] = img
    return templates


def detect_best_map(
    frame_bgr: np.ndarray,
    map_roi: Tuple[int, int, int, int],
    map_templates: Dict[str, np.ndarray],
    threshold: float,
    mode: str,
) -> Tuple[Optional[str], float]:
    if not map_templates:
        return None, -1.0

    crop = crop_roi(frame_bgr, map_roi)

    best_name: Optional[str] = None
    best_score: float = -1.0

    crop_p = _prep_for_detection(crop, mode)

    for name, tmpl in map_templates.items():
        th, tw = tmpl.shape[:2]
        if th < 5 or tw < 5:
            continue
        crop_rs_bgr = cv2.resize(crop, (tw, th), interpolation=cv2.INTER_AREA)
        crop_rs = _prep_for_detection(crop_rs_bgr, mode)
        tmpl_p = _prep_for_detection(tmpl, mode)

        res = cv2.matchTemplate(crop_rs, tmpl_p, cv2.TM_CCOEFF_NORMED)
        score = float(res.max())
        if score > best_score:
            best_score = score
            best_name = name

    if best_name is None or best_score < float(threshold):
        return None, best_score
    return best_name, best_score


def score_all_maps(
    frame_bgr: np.ndarray,
    map_roi: Tuple[int, int, int, int],
    map_templates: Dict[str, np.ndarray],
    mode: str,
) -> List[Tuple[str, float]]:
    crop = crop_roi(frame_bgr, map_roi)
    scored: List[Tuple[str, float]] = []

    for name, tmpl in map_templates.items():
        th, tw = tmpl.shape[:2]
        if th < 5 or tw < 5:
            continue
        crop_rs_bgr = cv2.resize(crop, (tw, th), interpolation=cv2.INTER_AREA)
        crop_p = _prep_for_detection(crop_rs_bgr, mode)
        tmpl_p = _prep_for_detection(tmpl, mode)
        res = cv2.matchTemplate(crop_p, tmpl_p, cv2.TM_CCOEFF_NORMED)
        scored.append((name, float(res.max())))

    scored.sort(key=lambda x: x[1], reverse=True)
    return scored


def _prep_for_detection(img_bgr: np.ndarray, mode: str) -> np.ndarray:
    mode = (mode or "edge").lower()
    if mode == "gray":
        return cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    if mode == "edge":
        g = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        return cv2.Canny(g, 50, 150)
    raise SystemExit("--detect-mode inválido. Use: gray ou edge")


def find_template(
    haystack_bgr: np.ndarray,
    needle_bgr: np.ndarray,
    threshold: float,
    mode: str = "edge",
) -> Tuple[bool, float, Tuple[int, int]]:
    hay = _prep_for_detection(haystack_bgr, mode)
    ned = _prep_for_detection(needle_bgr, mode)

    if hay.shape[0] < ned.shape[0] or hay.shape[1] < ned.shape[1]:
        return False, -1.0, (0, 0)

    res = cv2.matchTemplate(hay, ned, cv2.TM_CCOEFF_NORMED)
    _minv, maxv, _minl, maxl = cv2.minMaxLoc(res)
    score = float(maxv)
    return score >= float(threshold), score, (int(maxl[0]), int(maxl[1]))


def best_template_match(slot_bgr: np.ndarray, templates: Dict[str, np.ndarray]) -> Tuple[Optional[str], float]:
    best_name: Optional[str] = None
    best_score: float = -1.0

    for name, tmpl in templates.items():
        # Resize slot to template size (works best when templates are cropped to icon area).
        th, tw = tmpl.shape[:2]
        if th < 5 or tw < 5:
            continue
        slot_rs = cv2.resize(slot_bgr, (tw, th), interpolation=cv2.INTER_AREA)

        # Template matching expects template <= image; here same size, so result is 1x1.
        res = cv2.matchTemplate(slot_rs, tmpl, cv2.TM_CCOEFF_NORMED)
        score = float(res.max())
        if score > best_score:
            best_score = score
            best_name = name

    return best_name, best_score


def _prep_item(img_bgr: np.ndarray, mode: str) -> np.ndarray:
    mode = (mode or "edge").lower()
    if mode == "color":
        return img_bgr
    if mode == "gray":
        return cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    if mode == "edge":
        g = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        return cv2.Canny(g, 50, 150)
    raise SystemExit("--item-mode inválido. Use: color, gray ou edge")


def _to_gray(img: np.ndarray) -> np.ndarray:
    if img.ndim == 2:
        return img
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)


def _ncc_score(a: np.ndarray, b: np.ndarray) -> float:
    # Normalized cross-correlation-like score in [-1, 1].
    af = a.astype(np.float32)
    bf = b.astype(np.float32)
    af = af - float(af.mean())
    bf = bf - float(bf.mean())
    asd = float(af.std())
    bsd = float(bf.std())
    if asd < 1e-6 or bsd < 1e-6:
        return -1.0
    af = af / asd
    bf = bf / bsd
    return float((af * bf).mean())


def _apply_item_pad(img: np.ndarray, pad: int) -> np.ndarray:
    p = int(pad)
    if p <= 0:
        return img
    h, w = img.shape[:2]
    if h <= 2 * p + 2 or w <= 2 * p + 2:
        return img
    return img[p : h - p, p : w - p]


def _apply_item_pad_xy(img: np.ndarray, *, left: int, top: int, right: int, bottom: int) -> np.ndarray:
    l = int(left)
    t = int(top)
    r = int(right)
    b = int(bottom)
    if l <= 0 and t <= 0 and r <= 0 and b <= 0:
        return img
    h, w = img.shape[:2]
    x1 = max(0, l)
    y1 = max(0, t)
    x2 = w - max(0, r)
    y2 = h - max(0, b)
    # Keep at least a tiny image.
    if x2 <= x1 + 2 or y2 <= y1 + 2:
        return img
    return img[y1:y2, x1:x2]


def _crop_for_item(slot: np.ndarray, *, base_pad: int, pad_top: Optional[int], pad_bottom: Optional[int],
                   pad_left: Optional[int], pad_right: Optional[int]) -> np.ndarray:
    if pad_top is None and pad_bottom is None and pad_left is None and pad_right is None:
        return _apply_item_pad(slot, int(base_pad))
    p = int(base_pad)
    return _apply_item_pad_xy(
        slot,
        left=int(pad_left if pad_left is not None else p),
        top=int(pad_top if pad_top is not None else p),
        right=int(pad_right if pad_right is not None else p),
        bottom=int(pad_bottom if pad_bottom is not None else p),
    )


def _parse_int_list(csv: str) -> List[int]:
    out: List[int] = []
    for part in (csv or "").split(","):
        part = part.strip()
        if not part:
            continue
        try:
            out.append(int(part))
        except ValueError:
            continue
    return out


def _mean_roi(rois: List[Tuple[int, int, int, int]]) -> Tuple[int, int, int, int]:
    if not rois:
        return 0, 0, 0, 0
    sx = sum(r[0] for r in rois)
    sy = sum(r[1] for r in rois)
    sw = sum(r[2] for r in rois)
    sh = sum(r[3] for r in rois)
    n = len(rois)
    return int(round(sx / n)), int(round(sy / n)), int(round(sw / n)), int(round(sh / n))


def compare_images(template_path: Path, slot_path: Path, *, item_pad: int) -> None:
    tmpl_bgr = cv2.imread(str(template_path), cv2.IMREAD_COLOR)
    slot_bgr = cv2.imread(str(slot_path), cv2.IMREAD_COLOR)
    if tmpl_bgr is None:
        raise SystemExit(f"Não consegui ler template: {template_path}")
    if slot_bgr is None:
        raise SystemExit(f"Não consegui ler slot: {slot_path}")

    print(f"Template: {template_path}  ({tmpl_bgr.shape[1]}x{tmpl_bgr.shape[0]})")
    print(f"Slot:     {slot_path}  ({slot_bgr.shape[1]}x{slot_bgr.shape[0]})")

    pads = [0]
    if int(item_pad) not in pads:
        pads.append(int(item_pad))

    for pad in pads:
        s = _apply_item_pad(slot_bgr, pad)
        print(f"\n== compare (slot_pad={pad}) crop={s.shape[1]}x{s.shape[0]} ==")

        for mode in ["gray", "edge", "color"]:
            # Template matcher score (TM_CCOEFF_NORMED max)
            scored_t = score_all_items(
                s,
                {"T": tmpl_bgr},
                mode=mode,
                matcher="template",
                fixed_size=64,
                search_pad=6,
            )
            score_template = scored_t[0][1] if scored_t else -1.0

            # NCC matcher scores for a couple sizes
            scored_n64 = score_all_items(
                s,
                {"T": tmpl_bgr},
                mode=mode,
                matcher="ncc",
                fixed_size=64,
                search_pad=0,
            )
            score_n64 = scored_n64[0][1] if scored_n64 else -1.0

            scored_n128 = score_all_items(
                s,
                {"T": tmpl_bgr},
                mode=mode,
                matcher="ncc",
                fixed_size=128,
                search_pad=0,
            )
            score_n128 = scored_n128[0][1] if scored_n128 else -1.0

            print(
                f"mode={mode:<5} template={score_template:+.3f}  ncc64={score_n64:+.3f}  ncc128={score_n128:+.3f}"
            )


def best_template_match_v2(slot_bgr: np.ndarray, templates: Dict[str, np.ndarray], *, mode: str) -> Tuple[Optional[str], float]:
    best_name: Optional[str] = None
    best_score: float = -1.0

    slot_p = _prep_item(slot_bgr, mode)

    for name, tmpl_bgr in templates.items():
        tmpl_p = _prep_item(tmpl_bgr, mode)

        sh, sw = slot_p.shape[:2]
        th, tw = tmpl_p.shape[:2]
        if th < 5 or tw < 5 or sh < 5 or sw < 5:
            continue

        # Prefer template-in-image matching (translation tolerant).
        if th <= sh and tw <= sw:
            res = cv2.matchTemplate(slot_p, tmpl_p, cv2.TM_CCOEFF_NORMED)
            score = float(res.max())
        else:
            # Fallback: resize slot to template.
            if len(slot_p.shape) == 2:
                slot_rs = cv2.resize(slot_p, (tw, th), interpolation=cv2.INTER_AREA)
            else:
                slot_rs = cv2.resize(slot_p, (tw, th), interpolation=cv2.INTER_AREA)
            res = cv2.matchTemplate(slot_rs, tmpl_p, cv2.TM_CCOEFF_NORMED)
            score = float(res.max())

        if score > best_score:
            best_score = score
            best_name = name

    return best_name, best_score


def score_all_items(
    slot_bgr: np.ndarray,
    templates: Dict[str, np.ndarray],
    *,
    mode: str,
    matcher: str,
    fixed_size: int,
    search_pad: int,
) -> List[Tuple[str, float]]:
    scored: List[Tuple[str, float]] = []
    slot_p = _prep_item(slot_bgr, mode)

    matcher = (matcher or "template").lower()
    fs = int(fixed_size)
    if fs < 16:
        fs = 64

    if matcher == "ncc":
        # Size-invariant: resize both to a fixed size and compute normalized correlation.
        slot_g = _to_gray(slot_p)
        slot_rs = cv2.resize(slot_g, (fs, fs), interpolation=cv2.INTER_AREA)
        for name, tmpl_bgr in templates.items():
            tmpl_p = _prep_item(tmpl_bgr, mode)
            tmpl_g = _to_gray(tmpl_p)
            tmpl_rs = cv2.resize(tmpl_g, (fs, fs), interpolation=cv2.INTER_AREA)
            score = _ncc_score(slot_rs, tmpl_rs)
            scored.append((name, score))

        scored.sort(key=lambda x: x[1], reverse=True)
        return scored

    for name, tmpl_bgr in templates.items():
        tmpl_p = _prep_item(tmpl_bgr, mode)
        sh, sw = slot_p.shape[:2]
        th, tw = tmpl_p.shape[:2]
        if th < 5 or tw < 5 or sh < 5 or sw < 5:
            continue

        # Prefer true template matching without distorting pixels.
        # OpenCV requires template <= image. So we do it in whichever direction fits.
        if th <= sh and tw <= sw:
            # Template fits inside slot: translation tolerant.
            if th == sh and tw == sw and search_pad > 0:
                border = int(search_pad)
                padded = cv2.copyMakeBorder(slot_p, border, border, border, border, cv2.BORDER_REPLICATE)
                res = cv2.matchTemplate(padded, tmpl_p, cv2.TM_CCOEFF_NORMED)
            else:
                res = cv2.matchTemplate(slot_p, tmpl_p, cv2.TM_CCOEFF_NORMED)
            score = float(res.max())
        elif sh <= th and sw <= tw:
            # Slot fits inside template: match in the reverse direction.
            # This handles cases where the slot crop is a strict sub-image of the template.
            res = cv2.matchTemplate(tmpl_p, slot_p, cv2.TM_CCOEFF_NORMED)
            score = float(res.max())
        else:
            # Last resort: normalize both to the same size.
            slot_rs = cv2.resize(slot_p, (tw, th), interpolation=cv2.INTER_AREA)
            res = cv2.matchTemplate(slot_rs, tmpl_p, cv2.TM_CCOEFF_NORMED)
            score = float(res.max())

        scored.append((name, score))

    scored.sort(key=lambda x: x[1], reverse=True)
    return scored


def print_drop_stats(drops_log_path: Path, *, map_filter: Optional[str] = None) -> None:
    """Print a formatted table with item drop percentages from the accumulated log."""
    if not drops_log_path.exists():
        return
    try:
        data = json.loads(drops_log_path.read_text(encoding="utf-8"))
        if not isinstance(data, list) or len(data) == 0:
            return
    except (json.JSONDecodeError, OSError):
        return

    # Group runs by map.
    maps: Dict[str, List[Dict[str, Any]]] = {}
    for entry in data:
        m = entry.get("map") or "(desconhecido)"
        maps.setdefault(m, []).append(entry)

    # If a specific map was requested, only show that one.
    if map_filter is not None:
        if map_filter not in maps:
            return
        maps = {map_filter: maps[map_filter]}

    sep_char = "─"
    for map_name, runs in sorted(maps.items()):
        total_runs = len(runs)
        # Count how many times each item appeared (across all runs of this map).
        _hash_re = re.compile(r"^[0-9a-f]{32}$")
        item_counts: Dict[str, int] = {}
        for run in runs:
            summary = run.get("drops_summary", {})
            for item_id, qty in summary.items():
                if _hash_re.match(item_id):
                    continue  # skip unnamed (hash) items
                item_counts[item_id] = item_counts.get(item_id, 0) + int(qty)
        if not item_counts:
            continue

        total_items = sum(item_counts.values())

        # Sort by count descending.
        sorted_items = sorted(item_counts.items(), key=lambda kv: (-kv[1], kv[0]))

        # Compute column widths.
        col_item = max(len("Item"), max(len(n) for n, _ in sorted_items))
        col_qty = max(len("Qty"), max(len(str(q)) for _, q in sorted_items))
        col_pct = len("  %  ")

        header_title = f"  {map_name}  ({total_runs} runs, {total_items} drops)"
        table_width = col_item + 3 + col_qty + 3 + col_pct + 4
        table_width = max(table_width, len(header_title) + 4)

        print()
        print(f"┌{sep_char * (table_width)}┐")
        print(f"│{header_title:<{table_width}}│")
        print(f"├{sep_char * (table_width)}┤")

        hdr = f"  {'Item':<{col_item}} │ {'Qty':>{col_qty}} │  %  "
        print(f"│{hdr:<{table_width}}│")
        print(f"├{sep_char * (table_width)}┤")

        for item_name, count in sorted_items:
            pct = (count / total_runs) * 100.0
            row = f"  {item_name:<{col_item}} │ {count:>{col_qty}} │ {pct:5.1f}%"
            print(f"│{row:<{table_width}}│")

        print(f"└{sep_char * (table_width)}┘")


def run_once(cfg: GridConfig, args: argparse.Namespace, frame_bgr: Optional[np.ndarray] = None, *, clean: bool = False,
             forced_map: Optional[str] = None, forced_map_score: Optional[float] = None) -> Path:
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    ts = time.time()
    run_id = _make_run_id(ts)

    if clean:
        for p in out_dir.glob("slot_r*_c*.png"):
            try:
                p.unlink()
            except OSError:
                pass
        rp = out_dir / "results.json"
        if rp.exists():
            try:
                rp.unlink()
            except OSError:
                pass

    bgr = frame_bgr if frame_bgr is not None else capture_screen(cfg.monitor)
    templates = load_templates(Path(args.templates))
    map_templates = load_map_templates(Path(args.maps))

    map_name: Optional[str] = None
    map_score: Optional[float] = None
    if forced_map is not None or forced_map_score is not None:
        map_name, map_score = forced_map, forced_map_score
    elif cfg.map_roi is not None and map_templates:
        mn, ms = detect_best_map(
            bgr,
            cfg.map_roi,
            map_templates,
            threshold=float(args.map_threshold),
            mode=str(args.map_mode),
        )
        map_name, map_score = mn, (None if ms < 0 else ms)

    results: List[Dict[str, Any]] = []
    overlay = bgr.copy() if args.show else None

    export_enabled = bool(getattr(args, "export_unknown_to_templates", False))
    export_base = str(getattr(args, "export_unknown_name", "item") or "item").strip() or "item"
    export_templates_dir: Optional[Path] = None
    export_next_idx: Optional[int] = None
    if export_enabled:
        export_templates_dir = Path(str(getattr(args, "templates", "templates") or "templates"))
        try:
            export_templates_dir.mkdir(parents=True, exist_ok=True)
        except OSError:
            export_templates_dir = Path("templates")
            export_templates_dir.mkdir(parents=True, exist_ok=True)
        export_next_idx = _next_template_index(export_templates_dir, export_base, max_n=1000)

    screen_h, screen_w = bgr.shape[:2]

    for r, c, x1, y1, x2, y2 in iter_cells(cfg):
        # Clamp to screen bounds (used for overlay + fallback slot crop).
        x1c = max(0, min(screen_w - 1, int(x1)))
        y1c = max(0, min(screen_h - 1, int(y1)))
        x2c = max(x1c + 1, min(screen_w, int(x2)))
        y2c = max(y1c + 1, min(screen_h, int(y2)))

        per_key = f"r{r}c{c}"

        # Absolute per-slot ROI (from fullscreen calibration) has top priority.
        abs_roi = (cfg.slot_rois_abs.get(per_key) if cfg.slot_rois_abs else None)
        if abs_roi is not None:
            slot = crop_roi(bgr, abs_roi)
            per_roi = None
        else:
            slot = bgr[y1c:y2c, x1c:x2c]
            # Relative per-slot ROI next.
            per_roi = (cfg.slot_rois.get(per_key) if cfg.slot_rois else None)
            if per_roi is not None:
                slot = crop_roi(slot, per_roi)

        # Global inner ROI only when NOT using any per-slot ROI (abs or relative).
        if abs_roi is None and per_roi is None and cfg.slot_inner_roi is not None:
            slot = crop_roi(slot, cfg.slot_inner_roi)

        # Global trim applied for all slots (e.g., remove a 1px blue line on the right for every row).
        if cfg.global_trim is not None:
            slot = _apply_global_trim(slot, cfg.global_trim)

        # Per-row trims to remove UI lines that differ by row (e.g., blue top/bottom line).
        if cfg.row_trims and 0 <= int(r) < len(cfg.row_trims):
            rt, rb = cfg.row_trims[int(r)]
            slot = _apply_row_trim(slot, int(rt), int(rb))

        # Empty detection: use inner crop to avoid borders/quantity text.
        slot_for_empty = slot
        mp = int(args.match_pad)
        if mp > 0 and slot.shape[0] > 2 * mp + 2 and slot.shape[1] > 2 * mp + 2:
            slot_for_empty = slot[mp : slot.shape[0] - mp, mp : slot.shape[1] - mp]

        empty = slot_is_empty(slot_for_empty, cfg.empty_stddev_threshold)

        slot_path: Optional[Path] = None
        if not (args.skip_empty and empty):
            slot_path = out_dir / f"slot_r{r}_c{c}.png"
            save_pad = int(getattr(args, "save_pad", 0) or 0)
            sp_top = getattr(args, "save_pad_top", None)
            sp_bottom = getattr(args, "save_pad_bottom", None)
            sp_left = getattr(args, "save_pad_left", None)
            sp_right = getattr(args, "save_pad_right", None)
            if sp_top is None and sp_bottom is None and sp_left is None and sp_right is None:
                slot_to_save = _apply_item_pad(slot, save_pad)
            else:
                slot_to_save = _apply_item_pad_xy(
                    slot,
                    left=int(sp_left if sp_left is not None else save_pad),
                    top=int(sp_top if sp_top is not None else save_pad),
                    right=int(sp_right if sp_right is not None else save_pad),
                    bottom=int(sp_bottom if sp_bottom is not None else save_pad),
                )
            cv2.imwrite(str(slot_path), slot_to_save)

        name: Optional[str] = None
        score: Optional[float] = None
        best_name: Optional[str] = None
        best_score: Optional[float] = None
        chosen_pad = int(getattr(args, "item_pad", 0) or 0)

        if (not empty) and templates:
            # Item matching: optionally use a different crop than empty detection.
            # Some templates were captured with different crop amounts.
            # Auto mode tries multiple pads and picks the best result per slot.
            pad_candidates: List[int]
            if bool(getattr(args, "item_pad_auto", False)):
                pad_candidates = _parse_int_list(str(getattr(args, "item_pad_candidates", "0,12")))
                if not pad_candidates:
                    pad_candidates = [0, 12]
            else:
                pad_candidates = [int(getattr(args, "item_pad", 0) or 0)]

            best_scored: List[Tuple[str, float]] = []
            best_pad = pad_candidates[0]

            ip_top = getattr(args, "item_pad_top", None)
            ip_bottom = getattr(args, "item_pad_bottom", None)
            ip_left = getattr(args, "item_pad_left", None)
            ip_right = getattr(args, "item_pad_right", None)

            for pad in pad_candidates:
                slot_for_match = _crop_for_item(
                    slot,
                    base_pad=int(pad),
                    pad_top=ip_top,
                    pad_bottom=ip_bottom,
                    pad_left=ip_left,
                    pad_right=ip_right,
                )
                scored_try = score_all_items(
                    slot_for_match,
                    templates,
                    mode=str(args.item_mode),
                    matcher=str(args.item_matcher),
                    fixed_size=int(args.item_fixed_size),
                    search_pad=int(args.item_search_pad),
                )
                if not scored_try:
                    continue
                if (not best_scored) or (scored_try[0][1] > best_scored[0][1]):
                    best_scored = scored_try
                    best_pad = int(pad)

            chosen_pad = best_pad
            scored = best_scored
            if scored:
                best_name, best_score = scored[0]
                second_score = scored[1][1] if len(scored) > 1 else -1.0
                accept = False
                hard_min = getattr(args, "item_min_score", None)
                hard_min_f = (float(hard_min) if hard_min is not None else None)
                if hard_min_f is not None and float(best_score) < float(hard_min_f):
                    accept = False
                elif best_score >= cfg.template_threshold:
                    accept = True
                else:
                    low_thr = float(getattr(args, "item_low_threshold", 0.0) or 0.0)
                    margin = float(getattr(args, "item_min_margin", 0.0) or 0.0)
                    if best_score >= low_thr and (best_score - float(second_score)) >= margin:
                        accept = True

                if accept:
                    name, score = best_name, best_score

                if args.item_debug:
                    top = scored[:5]
                    top_txt = ", ".join([f"{n}:{s:.3f}" for n, s in top])
                    slot_for_match_dbg = _crop_for_item(
                        slot,
                        base_pad=int(chosen_pad),
                        pad_top=ip_top,
                        pad_bottom=ip_bottom,
                        pad_left=ip_left,
                        pad_right=ip_right,
                    )
                    slot_h, slot_w = slot_for_match_dbg.shape[:2]
                    bt_h, bt_w = templates[best_name].shape[:2] if best_name in templates else (-1, -1)
                    margin_txt = "n/a" if second_score < -0.5 else f"{(float(best_score) - float(second_score)):.3f}"
                    print(
                        f"Item debug r{r}c{c} top5: {top_txt} "
                        f"(matcher={str(args.item_matcher)}, pad={chosen_pad}, margin={margin_txt}, "
                        f"threshold={cfg.template_threshold:.2f}, crop={slot_w}x{slot_h}, best_tmpl={bt_w}x{bt_h})"
                    )
                    if args.item_debug_save:
                        dbg_path = out_dir / f"item_match_r{r}_c{c}.png"
                        cv2.imwrite(str(dbg_path), slot_for_match_dbg)

        # Optionally export unknown (non-empty, unmatched) crops as candidate templates.
        if (not empty) and (name is None) and export_enabled and export_templates_dir is not None:

            save_pad = int(getattr(args, "save_pad", 0) or 0)
            sp_top = getattr(args, "save_pad_top", None)
            sp_bottom = getattr(args, "save_pad_bottom", None)
            sp_left = getattr(args, "save_pad_left", None)
            sp_right = getattr(args, "save_pad_right", None)

            ip_top = getattr(args, "item_pad_top", None)
            ip_bottom = getattr(args, "item_pad_bottom", None)
            ip_left = getattr(args, "item_pad_left", None)
            ip_right = getattr(args, "item_pad_right", None)

            export_pad_base = max(int(chosen_pad), int(save_pad))
            # First apply the save-pad (for UI borders/highlight), then the item crop (to ignore qty corner).
            slot_after_save_crop = slot
            if not (sp_top is None and sp_bottom is None and sp_left is None and sp_right is None):
                slot_after_save_crop = _apply_item_pad_xy(
                    slot,
                    left=int(sp_left if sp_left is not None else save_pad),
                    top=int(sp_top if sp_top is not None else save_pad),
                    right=int(sp_right if sp_right is not None else save_pad),
                    bottom=int(sp_bottom if sp_bottom is not None else save_pad),
                )
                export_pad_base = int(chosen_pad)

            crop_for_template = _crop_for_item(
                slot_after_save_crop,
                base_pad=int(export_pad_base),
                pad_top=ip_top,
                pad_bottom=ip_bottom,
                pad_left=ip_left,
                pad_right=ip_right,
            )
            # Save with a sequential name and include where it came from:
            #   <base>_<n>_r<row>_c<col>.png
            # The index <n> stays globally unique even with the r/c suffix.
            near_thr = float(getattr(args, "export_near_match_threshold", 0.6) or 0.0)
            if (
                near_thr > 0.0
                and best_name is not None
                and best_score is not None
                and float(best_score) >= near_thr
            ):
                # Near-match: save as variant of the closest known template.
                near_idx = _next_template_index(export_templates_dir, best_name, max_n=1000)
                out_path = export_templates_dir / f"{best_name}_{near_idx}_r{r}_c{c}.png"
                print(
                    f"  [near-match] r{r}c{c} score={float(best_score):.3f} → salvo como {out_path.name}"
                )
            else:
                out_path = export_templates_dir / f"{uuid.uuid4().hex}.png"
            cv2.imwrite(str(out_path), crop_for_template)

        results.append(
            {
                "row": r,
                "col": c,
                "path": (str(slot_path.as_posix()) if slot_path is not None else None),
                "empty": empty,
                "match": name,
                "score": score,
                "best_match": best_name,
                "best_score": best_score,
                "match_pad": (chosen_pad if (not empty) else None),
            }
        )

        if overlay is not None:
            color = (0, 255, 0) if (name is not None) else ((0, 0, 255) if not empty else (180, 180, 180))
            cv2.rectangle(overlay, (x1c, y1c), (x2c, y2c), color, 2)
            label = name if name is not None else ("empty" if empty else "?")
            cv2.putText(
                overlay,
                label,
                (x1c, max(0, y1c - 6)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                color,
                1,
                cv2.LINE_AA,
            )

    results_path = out_dir / "results.json"

    drops: List[Dict[str, Any]] = []
    drops_summary: Dict[str, int] = {}
    unknown_count = 0
    for s in results:
        if s.get("empty"):
            continue
        if s.get("match") is None:
            unknown_count += 1
            continue
        name = str(s["match"])
        drops.append(
            {
                "name": name,
                "row": s["row"],
                "col": s["col"],
                "score": s.get("score"),
            }
        )
        drops_summary[name] = int(drops_summary.get(name, 0)) + 1

    payload: Dict[str, Any] = {
        "meta": {
            "ts": ts,
            "monitor": cfg.monitor,
            "map": map_name,
            "map_score": map_score,
        },
        "drops": drops,
        "drops_summary": drops_summary,
        "unknown_count": unknown_count,
        "slots": results,
    }
    results_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    # Persistent log: append this capture to a JSON array file (debug-friendly schema).
    drops_log_path = Path(str(getattr(args, "drops_log", "") or "").strip())
    if drops_log_path:
        try:
            drops_log_path.parent.mkdir(parents=True, exist_ok=True)
            existing: List[Dict[str, Any]] = []
            if drops_log_path.exists():
                try:
                    existing_obj = json.loads(drops_log_path.read_text(encoding="utf-8"))
                    if isinstance(existing_obj, list):
                        existing = existing_obj
                except json.JSONDecodeError:
                    existing = []

            existing.append(
                {
                    "ts": payload["meta"]["ts"],
                    "monitor": cfg.monitor,
                    "map": map_name,
                    "map_score": map_score,
                    "drops": drops,
                    "drops_summary": drops_summary,
                    "unknown_count": unknown_count,
                }
            )
            drops_log_path.write_text(
                json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        except OSError:
            # Avoid crashing the capture if log write fails.
            pass

    # Persistent runs log: schema requested by user.
    runs_log_path = Path(str(getattr(args, "runs_log", "") or "").strip())
    if runs_log_path:
        try:
            runs_log_path.parent.mkdir(parents=True, exist_ok=True)

            runs_existing: List[Dict[str, Any]] = []
            if runs_log_path.exists():
                try:
                    runs_obj = json.loads(runs_log_path.read_text(encoding="utf-8"))
                    if isinstance(runs_obj, list):
                        runs_existing = runs_obj
                except json.JSONDecodeError:
                    runs_existing = []

            items_found = [
                {"itemId": item_id, "qty": int(qty)}
                for item_id, qty in sorted(drops_summary.items(), key=lambda kv: kv[0])
            ]

            run_entry: Dict[str, Any] = {
                "id": run_id,
                "mapId": map_name,
                "itemsFound": items_found,
                "createdAt": _iso_utc(ts),
            }

            runs_existing.append(run_entry)
            runs_log_path.write_text(
                json.dumps(runs_existing, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        except OSError:
            pass

    # Print a compact summary.
    if cfg.map_roi is None:
        print("Mapa: (map_roi não configurado)")
    elif not map_templates:
        print("Mapa: (sem templates em ./maps)")
    else:
        if map_name is not None:
            print(f"Mapa detectado: {map_name} (score={map_score:.3f}, threshold={float(args.map_threshold):.2f})")
        else:
            score_txt = f"{map_score:.3f}" if isinstance(map_score, (int, float)) else "n/a"
            print(f"Mapa NÃO detectado (best_score={score_txt}, threshold={float(args.map_threshold):.2f})")
    for item in results:
        if item["empty"]:
            continue
        pos = f"r{item['row']}c{item['col']}"
        if item["match"] is not None:
            print(f"{pos}: {item['match']} (score={item['score']:.3f})")
        else:
            print(f"{pos}: unknown")

    print(f"Slots salvos em: {out_dir.resolve()}")
    print(f"Resultados: {results_path.resolve()}")

    # Show accumulated drop stats table for the current map.
    drops_log_p = Path(str(getattr(args, "drops_log", "") or "").strip())
    if drops_log_p and drops_log_p.exists():
        print_drop_stats(drops_log_p, map_filter=map_name)

    if overlay is not None:
        cv2.imshow("Overlay", overlay)
        cv2.waitKey(1)

    return results_path


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Captura e recorta os itens do 'Registro de Item' (grade) e opcionalmente identifica por templates."  # noqa: E501
    )
    parser.add_argument("--config", default=CONFIG_DEFAULT, help="Arquivo de config (json).")
    parser.add_argument("--monitor", type=int, default=1, help="Índice do monitor do MSS (1 = principal).")
    parser.add_argument("--list-monitors", action="store_true", help="Lista monitores detectados e sai.")
    parser.add_argument("--calibrate", action="store_true", help="Seleciona a ROI da grade e salva config.")
    parser.add_argument(
        "--watch",
        action="store_true",
        help="Fica em loop e captura automaticamente quando detectar a janela de Registro de Item.",
    )
    parser.add_argument(
        "--preview-grid",
        action="store_true",
        help=(
            "Captura 1 frame e mostra um overlay com grid_roi + linhas das células (para conferir alinhamento). "
            "ESC fecha." 
        ),
    )
    parser.add_argument(
        "--snap-grid-roi",
        action="store_true",
        help=(
            "Ajusta automaticamente o grid_roi atual encaixando nas bordas (corrige erros de 1-20px no olho). "
            "Salva na config. Use --show para visualizar o antes/depois." 
        ),
    )
    parser.add_argument(
        "--snap-grid-roi-margin",
        type=int,
        default=30,
        help="Margem (px) ao redor do grid_roi atual onde buscar as bordas (default: 30).",
    )
    parser.add_argument(
        "--compare",
        nargs=2,
        metavar=("TEMPLATE", "SLOT"),
        help="Diagnóstico: compara um TEMPLATE (png/jpg) com um SLOT (png/jpg) e imprime scores.",
    )
    parser.add_argument(
        "--calibrate-map",
        action="store_true",
        help="Seleciona a ROI do nome do mapa e salva na config (para registrar o mapa no results.json).",
    )
    parser.add_argument(
        "--set-row-trims",
        default=None,
        help=(
            "Define trims (px) por linha antes do matching/salvar. Formato: 'top,bottom;top,bottom;...' "
            "(ex 3 rows: '0,1;0,0;1,0' = r0 tira 1px de baixo, r1 nada, r2 tira 1px de cima)."
        ),
    )
    parser.add_argument(
        "--set-global-trim",
        default=None,
        help=(
            "Define trim GLOBAL (px) aplicado em TODOS os slots antes do matching/salvar. "
            "Formato: 'left,top,right,bottom' (ex: '0,0,1,0' tira 1px da direita)."
        ),
    )
    parser.add_argument(
        "--clear-global-trim",
        action="store_true",
        help="Remove global_trim da config.",
    )
    parser.add_argument(
        "--clear-row-trims",
        action="store_true",
        help="Remove row_trims da config.",
    )
    parser.add_argument(
        "--calibrate-slot-inner-roi",
        action="store_true",
        help=(
            "Seleciona e salva uma ROI FIXA dentro do slot (ex: só o ícone, sem T2/porcentagem/bordas). "
            "Isso é aplicado a todos os slots." 
        ),
    )
    parser.add_argument(
        "--auto-slot-inner-roi",
        action="store_true",
        help=(
            "Tenta detectar automaticamente o retângulo interno dos slots a partir de um print/capture da grade e "
            "salva em slot_inner_roi na config. Funciona melhor com a janela bem nítida e sem estar em movimento." 
        ),
    )
    parser.add_argument(
        "--calibrate-slot-rois",
        action="store_true",
        help=(
            "Seleciona e salva ROIs POR SLOT (um por vez) dentro do slot (relativo ao slot). "
            "Útil quando cada slot precisa de um recorte 100%% alinhado do jeito que você quer." 
        ),
    )
    parser.add_argument(
        "--calibrate-slot-rois-fullscreen",
        action="store_true",
        help=(
            "Calibra slot_rois selecionando os retângulos direto na TELA (screenshot completo). "
            "Bom quando você quer marcar exatamente o retângulo do UI mesmo com slots vazios." 
        ),
    )
    parser.add_argument(
        "--slot-rois-count",
        type=int,
        default=0,
        help="Quantos slots calibrar no --calibrate-slot-rois (0 = todos, default: 0).",
    )
    parser.add_argument(
        "--slot-rois-start",
        type=int,
        default=0,
        help="Índice inicial (0-based) no --calibrate-slot-rois (default: 0).",
    )
    parser.add_argument(
        "--calibrate-slot",
        type=str,
        default=None,
        help=(
            "Calibra UM slot específico na tela (fullscreen). Formato: 'row,col' (ex: '2,3'). "
            "Permite recalibrar slots individuais sem precisar refazer todos."
        ),
    )
    parser.add_argument(
        "--clear-slot-rois",
        action="store_true",
        help="Remove slot_rois (ROIs por-slot) da config e salva.",
    )
    parser.add_argument(
        "--recompute-slot-rois-row",
        type=int,
        default=None,
        help=(
            "Recalcula e sobrescreve os slot_rois de uma LINHA inteira (ex: 2 para r2), "
            "usando a média por coluna de outras linhas (ver --recompute-slot-rois-from-rows)."
        ),
    )
    parser.add_argument(
        "--recompute-slot-rois-from-rows",
        default="0,1",
        help="CSV de linhas base para calcular a média (default: 0,1).",
    )
    parser.add_argument(
        "--detect-template",
        default=None,
        help=(
            "Imagem (png/jpg) pequena para detectar a janela (ex: recorte do texto 'Registro de Item' ou do botão X). "
            "Se omitido, tenta usar templates/registry_detect.png."
        ),
    )
    parser.add_argument(
        "--detect-threshold",
        type=float,
        default=0.80,
        help="Score mínimo (0-1) para considerar que a janela apareceu.",
    )
    parser.add_argument(
        "--detect-mode",
        default="edge",
        choices=["edge", "gray"],
        help="Pré-processamento do template matching (edge costuma ser mais robusto).",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=0.25,
        help="Intervalo (segundos) entre verificações no modo --watch.",
    )
    parser.add_argument(
        "--cooldown",
        type=float,
        default=2.0,
        help="Tempo mínimo (segundos) entre capturas no modo --watch.",
    )
    parser.add_argument(
        "--map-interval",
        type=float,
        default=1.0,
        help="Intervalo (segundos) para reavaliar o mapa no modo --watch.",
    )
    parser.add_argument(
        "--dump-map-crop",
        action="store_true",
        help="Captura uma vez e salva o recorte do map_roi em output/map_crop.png (pra você criar templates).",
    )
    parser.add_argument(
        "--map-debug",
        action="store_true",
        help="No --watch, imprime os top scores de templates de mapa (ajuda a ajustar ROI/templates/threshold).",
    )
    parser.add_argument("--rows", type=int, default=6, help="Linhas da grade (usado no calibrate).")
    parser.add_argument("--cols", type=int, default=5, help="Colunas da grade (usado no calibrate).")
    parser.add_argument(
        "--cell-pad",
        type=int,
        default=None,
        help=(
            "Padding por célula (px). "+
            "Use >0 para cortar bordas, 0 para slot inteiro, <0 para expandir. "+
            "Se omitido no modo normal, usa o valor salvo na config."
        ),
    )
    parser.add_argument(
        "--empty-stddev",
        type=float,
        default=10.0,
        help="Desvio padrão (0-255) abaixo disso considera slot vazio.",
    )
    parser.add_argument(
        "--slot-inner-roi",
        default=None,
        help=(
            "ROI fixa dentro do slot no formato x,y,w,h (relativo ao slot). "
            "Ex: --slot-inner-roi 14,10,120,90 (evita bordas/T2/rodapé)."
        ),
    )
    parser.add_argument(
        "--template-threshold",
        type=float,
        default=0.78,
        help="Score mínimo (0-1) para aceitar match de template.",
    )
    parser.add_argument("--templates", default="templates", help="Pasta com templates (png/jpg).")
    parser.add_argument("--maps", default="maps", help="Pasta com templates de mapas (png/jpg).")
    parser.add_argument(
        "--drops-log",
        default=DEFAULT_DROPS_LOG,
        help="Arquivo JSON (array) para registrar histórico de drops. Use '' para desativar.",
    )
    parser.add_argument(
        "--runs-log",
        default=DEFAULT_RUNS_LOG,
        help="Arquivo JSON (array) no formato de runs (id/mapId/itemsFound/createdAt). Use '' para desativar.",
    )
    parser.add_argument(
        "--map-threshold",
        type=float,
        default=0.80,
        help="Score mínimo (0-1) para aceitar identificação do mapa.",
    )
    parser.add_argument(
        "--map-mode",
        default="edge",
        choices=["edge", "gray"],
        help="Pré-processamento usado para comparar mapas (edge costuma ser mais robusto).",
    )
    parser.add_argument(
        "--match-pad",
        type=int,
        default=12,
        help="Padding interno (px) usado APENAS para empty-detect/matching (não afeta o PNG salvo).",
    )
    parser.add_argument(
        "--save-pad",
        type=int,
        default=0,
        help=(
            "Padding interno (px) aplicado APENAS ao salvar os PNGs em --out (slot_*.png). "
            "Use isso pra cortar bordas/realce do UI (ex: --save-pad 8)."
        ),
    )
    parser.add_argument(
        "--save-pad-top",
        type=int,
        default=None,
        help="Override do --save-pad só pro topo (px). Ex: --save-pad 6 --save-pad-top 10",
    )
    parser.add_argument(
        "--save-pad-bottom",
        type=int,
        default=None,
        help="Override do --save-pad só pra baixo (px).",
    )
    parser.add_argument(
        "--save-pad-left",
        type=int,
        default=None,
        help="Override do --save-pad só pra esquerda (px).",
    )
    parser.add_argument(
        "--save-pad-right",
        type=int,
        default=None,
        help="Override do --save-pad só pra direita (px).",
    )
    parser.add_argument(
        "--item-pad",
        type=int,
        default=0,
        help=(
            "Padding interno (px) usado APENAS para comparar templates de item. "
            "Deixe 0 se seus templates são do slot completo; aumente se quiser ignorar bordas/quantidade."
        ),
    )
    parser.add_argument(
        "--item-pad-top",
        type=int,
        default=None,
        help="Override do --item-pad só pro topo (px). Ex: --item-pad 6 --item-pad-top 10",
    )
    parser.add_argument(
        "--item-pad-bottom",
        type=int,
        default=None,
        help="Override do --item-pad só pra baixo (px). Útil pra remover o número da quantidade.",
    )
    parser.add_argument(
        "--item-pad-left",
        type=int,
        default=None,
        help="Override do --item-pad só pra esquerda (px). Útil pra remover o número da quantidade.",
    )
    parser.add_argument(
        "--item-pad-right",
        type=int,
        default=None,
        help="Override do --item-pad só pra direita (px).",
    )
    parser.add_argument(
        "--item-pad-auto",
        action="store_true",
        help="Tenta múltiplos pads por slot e escolhe o que dá maior score (ajuda quando templates foram salvos com crops diferentes).",
    )
    parser.add_argument(
        "--item-pad-candidates",
        default="0,12",
        help="Lista CSV de pads a testar quando --item-pad-auto (ex: '0,8,12').",
    )
    parser.add_argument(
        "--item-mode",
        default="edge",
        choices=["edge", "gray", "color"],
        help="Pré-processamento para reconhecer itens (edge costuma ser mais robusto).",
    )
    parser.add_argument(
        "--item-matcher",
        default="template",
        choices=["template", "ncc"],
        help="Algoritmo de matching de itens: template (matchTemplate) ou ncc (resize fixo + correlação).",
    )
    parser.add_argument(
        "--item-fixed-size",
        type=int,
        default=64,
        help="Tamanho (px) usado no matcher ncc (ex: 64).",
    )
    parser.add_argument(
        "--item-low-threshold",
        type=float,
        default=0.80,
        help="Threshold alternativo (0-1) para aceitar match quando houver boa margem sobre o 2º lugar.",
    )
    parser.add_argument(
        "--item-min-score",
        type=float,
        default=None,
        help=(
            "Score mínimo ABSOLUTO (0-1) para aceitar um match de item. "
            "Se o best_score for menor que isso, o slot continua unknown, mesmo que tenha boa margem. "
            "Ex: --item-min-score 0.93"
        ),
    )
    parser.add_argument(
        "--item-min-margin",
        type=float,
        default=0.06,
        help="Margem mínima (best - second) para aceitar match usando --item-low-threshold.",
    )
    parser.add_argument(
        "--item-search-pad",
        type=int,
        default=6,
        help="Padding extra (px) para tolerar pequenas diferenças de alinhamento ao comparar item template vs slot.",
    )
    parser.add_argument(
        "--item-debug",
        action="store_true",
        help="Mostra top scores de templates por slot (ajuda a ajustar threshold/mode/pads).",
    )
    parser.add_argument(
        "--item-debug-save",
        action="store_true",
        help="Salva o recorte usado no matching em output/item_match_rX_cY.png (quando --item-debug).",
    )
    parser.add_argument(
        "--export-unknown-to-templates",
        action="store_true",
        help=(
            "Quando um slot NÃO vazio não for reconhecido, salva automaticamente esse recorte dentro da pasta --templates "
            "com um nome gerado (útil para você ir criando templates)."
        ),
    )
    parser.add_argument(
        "--export-unknown-name",
        default="item",
        help=(
            "Nome-base usado ao exportar desconhecidos (gera: <nome>_<n>_r<row>_c<col>.png, "
            "ex: item_25_r0_c2.png)."
        ),
    )
    parser.add_argument(
        "--export-near-match-threshold",
        type=float,
        default=0.6,
        help=(
            "Score mínimo (0-1) para salvar um slot não reconhecido como variante do melhor match. "
            "Ex: score=0.793 para c6be6192... → salvo como <best_name>_<n>_r0_c2.png. "
            "Use 0 ou 1 para desativar. Default: 0.6."
        ),
    )
    parser.add_argument("--out", default="output", help="Pasta de saída para slots e results.json")
    parser.add_argument(
        "--skip-empty",
        action="store_true",
        help="Não salva imagens de slots vazios (fundo azul/cinza).",
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Limpa arquivos antigos em --out (slot_*.png e results.json) antes de salvar.",
    )
    parser.add_argument("--show", action="store_true", help="Mostra overlay com a grade/labels.")

    args = parser.parse_args()

    if args.compare:
        t, s = args.compare
        compare_images(Path(t), Path(s), item_pad=int(args.item_pad))
        return

    if args.list_monitors:
        list_monitors()
        return

    cfg_path = Path(args.config)
    if args.calibrate:
        bgr = capture_screen(args.monitor)
        cal_w, cal_h = bgr.shape[1], bgr.shape[0]
        roi = select_roi(bgr, "Selecione a grade do Registro de Item (apenas a grade)")
        cell_pad = args.cell_pad if args.cell_pad is not None else 0
        # Preserve existing map_roi / per-slot ROIs when re-calibrating only the grid ROI.
        if cfg_path.exists():
            base = load_config(cfg_path)
            cfg = replace(
                base,
                monitor=int(args.monitor),
                grid_roi=roi,
                rows=int(args.rows),
                cols=int(args.cols),
                cell_pad=int(cell_pad),
                empty_stddev_threshold=float(args.empty_stddev),
                template_threshold=float(args.template_threshold),
                map_threshold=float(args.map_threshold),
                calibrated_resolution=(cal_w, cal_h),
            )
        else:
            cfg = GridConfig(
                monitor=int(args.monitor),
                grid_roi=roi,
                map_roi=None,
                slot_inner_roi=None,
                slot_rois=None,
                slot_rois_abs=None,
                rows=int(args.rows),
                cols=int(args.cols),
                cell_pad=int(cell_pad),
                empty_stddev_threshold=float(args.empty_stddev),
                template_threshold=float(args.template_threshold),
                map_threshold=float(args.map_threshold),
                calibrated_resolution=(cal_w, cal_h),
            )
        save_config(cfg_path, cfg)
        print(f"Config salva em: {cfg_path.resolve()}  (resolução: {cal_w}x{cal_h})")
        return

    if not cfg_path.exists():
        raise SystemExit(
            f"Config não encontrada: {cfg_path}. Rode primeiro: python item_registry.py --calibrate"
        )

    cfg = load_config(cfg_path)

    # --- Auto-scale pixel coordinates if resolution changed ---
    try:
        actual_w, actual_h = get_screen_resolution(cfg.monitor)
        cfg = scale_config_to_resolution(cfg, actual_w, actual_h)
    except Exception as e:
        print(f"Aviso: não foi possível detectar resolução do monitor: {e}")

    if args.clear_global_trim:
        cfg2 = replace(cfg, global_trim=None)
        save_config(cfg_path, cfg2)
        print(f"global_trim removido e salvo em: {cfg_path.resolve()}")
        return

    if getattr(args, "set_global_trim", None):
        try:
            gt = _parse_trim4_spec(str(args.set_global_trim))
        except Exception as e:
            raise SystemExit(f"--set-global-trim inválido: {e}")
        cfg2 = replace(cfg, global_trim=gt)
        save_config(cfg_path, cfg2)
        print(f"global_trim salvo em: {cfg_path.resolve()}  => {gt}")
        return

    if args.clear_row_trims:
        cfg2 = replace(cfg, row_trims=None)
        save_config(cfg_path, cfg2)
        print(f"row_trims removido e salvo em: {cfg_path.resolve()}")
        return

    if getattr(args, "set_row_trims", None):
        try:
            trims = _parse_row_trims_spec(str(args.set_row_trims))
        except Exception as e:
            raise SystemExit(f"--set-row-trims inválido: {e}")
        if len(trims) != int(cfg.rows):
            raise SystemExit(
                f"--set-row-trims precisa ter {int(cfg.rows)} entradas (rows={int(cfg.rows)}), "
                f"mas veio {len(trims)}."
            )
        cfg2 = replace(cfg, row_trims=trims)
        save_config(cfg_path, cfg2)
        print(f"row_trims salvo em: {cfg_path.resolve()}  => {trims}")
        return

    if args.snap_grid_roi:
        frame = capture_screen(cfg.monitor)
        old_roi = cfg.grid_roi
        new_roi, dbg = snap_grid_roi_from_edges(
            frame,
            old_roi,
            margin=int(getattr(args, "snap_grid_roi_margin", 30)),
        )
        cfg2 = replace(cfg, grid_roi=new_roi)
        save_config(cfg_path, cfg2)
        print("grid_roi ajustado automaticamente:")
        print(f"  antigo: {old_roi}")
        print(f"  novo:   {new_roi}")
        if not dbg.get("snapped", True):
            print(f"  aviso: snap não aplicou ({dbg.get('reason', 'desconhecido')})")

        if args.show:
            overlay = frame.copy()
            ox, oy, ow, oh = old_roi
            nx, ny, nw, nh = new_roi
            cv2.rectangle(
                overlay,
                (int(ox), int(oy)),
                (int(ox + ow - 1), int(oy + oh - 1)),
                (0, 0, 255),
                2,
            )
            cv2.rectangle(
                overlay,
                (int(nx), int(ny)),
                (int(nx + nw - 1), int(ny + nh - 1)),
                (0, 200, 255),
                2,
            )
            cv2.putText(
                overlay,
                "snap-grid-roi: red=old  yellow=new  ESC closes",
                (10, 24),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.65,
                (0, 255, 255),
                2,
                cv2.LINE_AA,
            )
            cv2.imshow("snap-grid-roi", overlay)
            try:
                while True:
                    k = cv2.waitKey(20) & 0xFF
                    if k == 27:
                        break
            except KeyboardInterrupt:
                pass
            finally:
                cv2.destroyAllWindows()
        return

    if args.preview_grid:
        frame = capture_screen(cfg.monitor)
        overlay = frame.copy()

        gx, gy, gw, gh = cfg.grid_roi
        # Our ROIs are (x, y, w, h) with exclusive end in slicing, but cv2.rectangle uses inclusive end.
        cv2.rectangle(
            overlay,
            (int(gx), int(gy)),
            (int(gx + gw - 1), int(gy + gh - 1)),
            (0, 200, 255),
            2,
        )

        # Draw cell boundaries using pad_override=0 (raw grid division).
        cells0 = iter_cells(cfg, pad_override=0)
        for r, c, x1, y1, x2, y2 in cells0:
            cv2.rectangle(overlay, (int(x1), int(y1)), (int(x2 - 1), int(y2 - 1)), (120, 120, 120), 1)
            if r == 0 and c == 0:
                cv2.putText(
                    overlay,
                    "r0c0",
                    (int(x1) + 6, int(y1) + 18),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (120, 120, 120),
                    2,
                    cv2.LINE_AA,
                )

        # If cell_pad is being used, also show the padded cell bounds in green.
        if int(cfg.cell_pad) != 0:
            cells_pad = iter_cells(cfg)  # uses cfg.cell_pad
            for _r, _c, x1, y1, x2, y2 in cells_pad:
                cv2.rectangle(overlay, (int(x1), int(y1)), (int(x2 - 1), int(y2 - 1)), (0, 255, 0), 1)

        cv2.putText(
            overlay,
            "preview-grid: gray=cells(pad=0)  green=cells(cell_pad)  ESC closes",
            (10, 24),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (0, 255, 255),
            2,
            cv2.LINE_AA,
        )

        cv2.imshow("preview-grid", overlay)
        try:
            while True:
                k = cv2.waitKey(20) & 0xFF
                if k == 27:
                    break
        except KeyboardInterrupt:
            pass
        finally:
            cv2.destroyAllWindows()
        return

    if args.auto_slot_inner_roi:
        if not cfg.grid_roi:
            raise SystemExit("Config sem grid_roi. Rode --calibrate primeiro.")

        frame = capture_screen(cfg.monitor)
        try:
            roi_med, detections = auto_calculate_slot_inner_roi(frame, cfg)
        except SystemExit as e:
            out_dir = Path(args.out)
            out_dir.mkdir(parents=True, exist_ok=True)
            dbg_frame = out_dir / "auto_roi_debug_frame.png"
            cv2.imwrite(str(dbg_frame), frame)
            try:
                grid = crop_roi(frame, cfg.grid_roi)
                cv2.imwrite(str(out_dir / "auto_roi_debug_grid.png"), grid)
            except Exception:
                pass
            try:
                cells = iter_cells(cfg, pad_override=0)
                if cells:
                    _r, _c, x1, y1, x2, y2 = cells[0]
                    slot0 = frame[y1:y2, x1:x2]
                    cv2.imwrite(str(out_dir / "auto_roi_debug_slot_r0c0.png"), slot0)
            except Exception:
                pass
            print(f"Debug salvo em: {dbg_frame.resolve()}")
            raise
        cfg2 = replace(cfg, slot_inner_roi=roi_med)
        save_config(cfg_path, cfg2)

        print("slot_inner_roi detectado automaticamente:")
        print(f"  x,y,w,h = {roi_med}")
        print(f"  amostras usadas: {len(detections)}")
        if cfg.slot_rois:
            print("Dica: sua config ainda tem slot_rois (por-slot). Se quiser padronizar tudo só pelo slot_inner_roi, rode: --clear-slot-rois")

        if args.show:
            overlay = frame.copy()
            # Draw inner ROI for each cell (preview only).
            for r, c, x1, y1, x2, y2 in iter_cells(cfg, pad_override=0):
                cv2.rectangle(overlay, (x1, y1), (x2, y2), (0, 140, 255), 1)
                rx, ry, rw, rh = roi_med
                cv2.rectangle(overlay, (x1 + rx, y1 + ry), (x1 + rx + rw, y1 + ry + rh), (0, 255, 0), 2)
                cv2.putText(
                    overlay,
                    f"r{r}c{c}",
                    (x1 + 6, y1 + 18),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    (0, 255, 0),
                    1,
                    cv2.LINE_AA,
                )
            cv2.imshow("auto-slot-inner-roi preview (ESC fecha)", overlay)
            while True:
                k = cv2.waitKey(20) & 0xFF
                if k == 27:
                    break
            cv2.destroyAllWindows()

        return

    if args.clear_slot_rois:
        cfg2 = replace(cfg, slot_rois=None, slot_rois_abs=None)
        save_config(cfg_path, cfg2)
        print(f"slot_rois removido e salvo em: {cfg_path.resolve()}")
        return

    if args.recompute_slot_rois_row is not None:
        target_row = int(args.recompute_slot_rois_row)
        from_rows = _parse_int_list(str(args.recompute_slot_rois_from_rows))
        if not from_rows:
            raise SystemExit("--recompute-slot-rois-from-rows inválido (ex: 0,1)")
        if target_row in from_rows:
            from_rows = [r for r in from_rows if r != target_row]
        if not from_rows:
            raise SystemExit("Linhas base vazias após remover a linha alvo.")
        if cfg.slot_rois is None:
            raise SystemExit("slot_rois não existe na config. Rode: --calibrate-slot-rois")

        rois = dict(cfg.slot_rois)
        updated = 0
        for c in range(int(cfg.cols)):
            samples: List[Tuple[int, int, int, int]] = []
            for r in from_rows:
                k = f"r{r}c{c}"
                v = rois.get(k)
                if v is not None:
                    samples.append(v)
            if not samples:
                continue
            rois[f"r{target_row}c{c}"] = _mean_roi(samples)
            updated += 1

        if updated == 0:
            raise SystemExit("Não encontrei ROIs nas linhas base para calcular média.")

        cfg2 = replace(cfg, slot_rois=rois)
        save_config(cfg_path, cfg2)
        print(
            f"slot_rois recalculado para r{target_row} (cols 0..{int(cfg.cols) - 1}) usando rows={from_rows}. "
            f"Config: {cfg_path.resolve()}"
        )
        return

    # Allow overrides without rewriting the config file.
    if getattr(args, "slot_inner_roi", None):
        try:
            parts = [int(p.strip()) for p in str(args.slot_inner_roi).split(",")]
            if len(parts) == 4:
                cfg = replace(cfg, slot_inner_roi=(parts[0], parts[1], parts[2], parts[3]))
        except ValueError:
            pass

    # Allow overrides without rewriting the config file.
    if args.cell_pad is not None:
        cfg = replace(cfg, cell_pad=int(args.cell_pad))
    if args.empty_stddev is not None:
        cfg = replace(cfg, empty_stddev_threshold=float(args.empty_stddev))
    if args.template_threshold is not None:
        cfg = replace(cfg, template_threshold=float(args.template_threshold))

    if args.map_threshold is not None:
        cfg = replace(cfg, map_threshold=float(args.map_threshold))

    if args.calibrate_map:
        bgr = capture_screen(cfg.monitor)
        roi = select_roi(bgr, "Selecione a área do NOME DO MAPA (ex: 'Altar da Ruína')")
        cfg2 = replace(cfg, map_roi=roi)
        save_config(cfg_path, cfg2)
        print(f"Map ROI salva em: {cfg_path.resolve()}")
        return

    if args.calibrate_slot_inner_roi:
        # Load one slot crop and let the user select a fixed ROI relative to the slot.
        bgr = capture_screen(cfg.monitor)
        cells = iter_cells(cfg)
        if not cells:
            raise SystemExit("Config inválida: nenhum slot calculado.")
        r0, c0, x1, y1, x2, y2 = cells[0]

        screen_h, screen_w = bgr.shape[:2]
        x1c = max(0, min(screen_w - 1, int(x1)))
        y1c = max(0, min(screen_h - 1, int(y1)))
        x2c = max(x1c + 1, min(screen_w, int(x2)))
        y2c = max(y1c + 1, min(screen_h, int(y2)))
        slot0 = bgr[y1c:y2c, x1c:x2c]

        roi = select_roi(slot0, "Selecione a ROI DENTRO DO SLOT (somente o ícone, sem bordas/T2/rodapé)")
        cfg2 = replace(cfg, slot_inner_roi=roi)
        save_config(cfg_path, cfg2)
        print(f"Slot inner ROI salva em: {cfg_path.resolve()}")
        return

    if args.calibrate_slot_rois:
        # Calibrate per-slot ROIs (relative to each slot crop), sequentially.
        bgr = capture_screen(cfg.monitor)
        cells = iter_cells(cfg)
        if not cells:
            raise SystemExit("Config inválida: nenhum slot calculado.")

        start = max(0, int(args.slot_rois_start))
        count = int(args.slot_rois_count)
        if count <= 0:
            count = len(cells)  # 0 = calibrar todos

        end = min(len(cells), start + count)
        if start >= len(cells):
            raise SystemExit(f"--slot-rois-start fora do range (max {len(cells) - 1}).")

        rois: Dict[str, Tuple[int, int, int, int]] = dict(cfg.slot_rois or {})
        print(
            f"Calibrando ROIs por-slot: slots [{start}..{end - 1}] (total {end - start}). "
            "Selecione o ROI dentro do slot e aperte ENTER; ESC cancela." 
        )

        screen_h, screen_w = bgr.shape[:2]
        for idx in range(start, end):
            r, c, x1, y1, x2, y2 = cells[idx]

            x1c = max(0, min(screen_w - 1, int(x1)))
            y1c = max(0, min(screen_h - 1, int(y1)))
            x2c = max(x1c + 1, min(screen_w, int(x2)))
            y2c = max(y1c + 1, min(screen_h, int(y2)))
            slot_img = bgr[y1c:y2c, x1c:x2c]

            title = f"ROI slot r{r} c{c} (idx {idx})"
            x, y, w, h = zoomable_select_roi(slot_img, title)
            if w == 0 or h == 0:
                raise SystemExit("ROI cancelada. Nenhuma alteração foi salva.")

            key = f"r{r}c{c}"
            rois[key] = (int(x), int(y), int(w), int(h))
            print(f"Salvo {key}: x={int(x)} y={int(y)} w={int(w)} h={int(h)}")

        cfg2 = replace(cfg, slot_rois=rois)
        save_config(cfg_path, cfg2)
        print(f"slot_rois salvo em: {cfg_path.resolve()}")
        return

    if args.calibrate_slot_rois_fullscreen:
        # Calibrate per-slot ROIs by selecting each rectangle on the full screenshot.
        bgr = capture_screen(cfg.monitor)
        # Auto-save calibrated resolution
        cal_w, cal_h = bgr.shape[1], bgr.shape[0]
        if cfg.calibrated_resolution is None or cfg.calibrated_resolution != (cal_w, cal_h):
            cfg = replace(cfg, calibrated_resolution=(cal_w, cal_h))
        total = int(cfg.rows) * int(cfg.cols)
        if total <= 0:
            raise SystemExit("Config inválida: rows/cols inválidos.")

        start = max(0, int(args.slot_rois_start))
        count = int(args.slot_rois_count)
        if count <= 0:
            count = total  # 0 = calibrar todos os slots

        end = min(total, start + count)
        if start >= total:
            raise SystemExit(f"--slot-rois-start fora do range (max {total - 1}).")

        rois_abs: Dict[str, Tuple[int, int, int, int]] = dict(cfg.slot_rois_abs or {})
        print(
            f"Calibrando ROIs por-slot (fullscreen): slots [{start}..{end - 1}] (total {end - start}). "
            f"Grid: {cfg.rows} linhas x {cfg.cols} colunas = {total} slots.\n"
            "Selecione o retângulo EXATO do item/slot na tela; ENTER confirma; ESC pula o slot." 
        )

        gx, gy, gw, gh = cfg.grid_roi
        for idx in range(start, end):
            r = idx // int(cfg.cols)
            c = idx % int(cfg.cols)
            key = f"r{r}c{c}"

            overlay = bgr.copy()
            # Draw grid_roi border.
            cv2.rectangle(overlay, (int(gx), int(gy)), (int(gx + gw), int(gy + gh)), (0, 200, 255), 2)

            # Draw previously calibrated slots as green rectangles.
            for prev_key, prev_roi in rois_abs.items():
                px, py, pw, ph = prev_roi
                cv2.rectangle(overlay, (int(px), int(py)), (int(px + pw), int(py + ph)), (0, 255, 0), 2)
                cv2.putText(
                    overlay,
                    prev_key,
                    (int(px) + 4, int(py) + 16),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.45,
                    (0, 255, 0),
                    1,
                    cv2.LINE_AA,
                )

            remaining = end - idx
            cv2.putText(
                overlay,
                f"Selecione slot {key} (r={r} c={c}) | {remaining} restantes | ENTER confirma | ESC pula",
                (max(10, int(gx)), max(24, int(gy) - 12)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (0, 255, 255),
                2,
                cv2.LINE_AA,
            )

            title = f"fullscreen slot_rois_abs: {key}"
            sx, sy, sw, sh = zoomable_select_roi(overlay, title)
            if sw == 0 or sh == 0:
                print(f"Slot {key} pulado (ESC ou seleção vazia).")
                continue

            rois_abs[key] = (int(sx), int(sy), int(sw), int(sh))
            print(f"Salvo {key}: x={rois_abs[key][0]} y={rois_abs[key][1]} w={rois_abs[key][2]} h={rois_abs[key][3]}")

            # Save after each slot to avoid losing progress.
            cfg2 = replace(cfg, slot_rois_abs=rois_abs)
            save_config(cfg_path, cfg2)

        print(f"slot_rois_abs (fullscreen) salvo em: {cfg_path.resolve()}")
        print(f"Total de slots calibrados: {len(rois_abs)}/{total}")
        return

    if args.calibrate_slot is not None:
        # Calibrate a SINGLE specific slot on the full screenshot.
        parts = str(args.calibrate_slot).replace(" ", "").split(",")
        if len(parts) != 2:
            raise SystemExit("--calibrate-slot formato inválido. Use: 'row,col' (ex: '2,3')")
        try:
            target_r, target_c = int(parts[0]), int(parts[1])
        except ValueError:
            raise SystemExit("--calibrate-slot formato inválido. Use: 'row,col' (ex: '2,3')")

        if target_r < 0 or target_r >= cfg.rows:
            raise SystemExit(f"Linha {target_r} fora do range (0..{cfg.rows - 1}).")
        if target_c < 0 or target_c >= cfg.cols:
            raise SystemExit(f"Coluna {target_c} fora do range (0..{cfg.cols - 1}).")

        bgr = capture_screen(cfg.monitor)
        key = f"r{target_r}c{target_c}"
        rois_abs_single: Dict[str, Tuple[int, int, int, int]] = dict(cfg.slot_rois_abs or {})

        overlay = bgr.copy()
        gx, gy, gw, gh = cfg.grid_roi
        cv2.rectangle(overlay, (int(gx), int(gy)), (int(gx + gw), int(gy + gh)), (0, 200, 255), 2)

        # Draw all existing calibrated slots as green.
        for prev_key, prev_roi in rois_abs_single.items():
            px, py, pw, ph = prev_roi
            color = (0, 0, 255) if prev_key == key else (0, 255, 0)  # Red for the one being re-calibrated.
            cv2.rectangle(overlay, (int(px), int(py)), (int(px + pw), int(py + ph)), color, 2)
            cv2.putText(
                overlay,
                prev_key,
                (int(px) + 4, int(py) + 16),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.45,
                color,
                1,
                cv2.LINE_AA,
            )

        cv2.putText(
            overlay,
            f"Recalibrando slot {key} (r={target_r} c={target_c}) | ENTER confirma | ESC cancela",
            (max(10, int(gx)), max(24, int(gy) - 12)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 255, 255),
            2,
            cv2.LINE_AA,
        )

        title = f"Calibrar slot {key}"
        sx, sy, sw, sh = zoomable_select_roi(overlay, title)
        if sw == 0 or sh == 0:
            raise SystemExit(f"Calibração de {key} cancelada.")

        rois_abs_single[key] = (int(sx), int(sy), int(sw), int(sh))
        cfg2 = replace(cfg, slot_rois_abs=rois_abs_single)
        save_config(cfg_path, cfg2)
        print(f"Slot {key} salvo: x={int(sx)} y={int(sy)} w={int(sw)} h={int(sh)}")
        print(f"Config salva em: {cfg_path.resolve()}")
        return

    if args.dump_map_crop:
        if cfg.map_roi is None:
            raise SystemExit("map_roi não configurado. Rode: python item_registry.py --calibrate-map")
        out_dir = Path(args.out)
        out_dir.mkdir(parents=True, exist_ok=True)
        frame = capture_screen(cfg.monitor)
        crop = crop_roi(frame, cfg.map_roi)
        out_path = out_dir / "map_crop.png"
        cv2.imwrite(str(out_path), crop)
        print(f"Map crop salvo em: {out_path.resolve()}")
        return

    if args.watch:
        detect_path = Path(args.detect_template) if args.detect_template else Path(args.templates) / "registry_detect.png"
        if not detect_path.exists():
            raise SystemExit(
                "Modo --watch precisa de um template de detecção. "
                "Crie um PNG pequeno (ex: recorte do texto 'Registro de Item' ou do botão X) em templates/registry_detect.png "
                "ou passe --detect-template <arquivo>."
            )
        detect_img = cv2.imread(str(detect_path), cv2.IMREAD_COLOR)
        if detect_img is None:
            raise SystemExit(f"Não consegui ler template: {detect_path}")

        map_templates = load_map_templates(Path(args.maps))
        current_map: Optional[str] = None
        current_map_score: Optional[float] = None
        last_map_check_ts = 0.0
        last_logged_map: Optional[str] = None
        last_logged_status: Optional[str] = None

        # In watch mode, --clean is typically meant to remove leftovers once,
        # not delete previous drop captures repeatedly.
        cleaned_once = False

        last_present = False
        last_capture_ts = 0.0
        print("Watch ligado. Ctrl+C para parar.")

        try:
            while True:
                frame = capture_screen(cfg.monitor)
                present, score, loc = find_template(
                    frame,
                    detect_img,
                    threshold=float(args.detect_threshold),
                    mode=str(args.detect_mode),
                )

                now = time.time()

                # Detect current map BEFORE the registry appears.
                if cfg.map_roi is None:
                    status = "missing_map_roi"
                    if last_logged_status != status:
                        print("Mapa atual: (map_roi não configurado — rode: python item_registry.py --calibrate-map)")
                        last_logged_status = status
                        last_logged_map = None
                elif not map_templates:
                    status = "missing_map_templates"
                    if last_logged_status != status:
                        print("Mapa atual: (sem templates em ./maps — adicione PNGs em maps/)")
                        last_logged_status = status
                        last_logged_map = None
                elif now - last_map_check_ts >= float(args.map_interval):
                    last_map_check_ts = now
                    mn, ms = detect_best_map(
                        frame,
                        cfg.map_roi,
                        map_templates,
                        threshold=float(args.map_threshold),
                        mode=str(args.map_mode),
                    )
                    new_map = mn
                    new_score: Optional[float] = None if ms < 0 else ms

                    # Sticky behavior:
                    # - If map is visible and recognized, update.
                    # - If not recognized (e.g., in-match UI doesn't show the name), keep last known map.
                    if new_map is not None:
                        current_map = new_map
                        current_map_score = new_score

                    if args.map_debug and cfg.map_roi is not None and map_templates:
                        top = score_all_maps(frame, cfg.map_roi, map_templates, mode=str(args.map_mode))[:5]
                        if top:
                            top_txt = ", ".join([f"{n}:{s:.3f}" for n, s in top])
                            print(f"Map debug top5: {top_txt}")

                    # Log only when status changes to avoid spamming the same message.
                    if current_map is not None and current_map_score is not None:
                        status = f"known:{current_map}"
                        if last_logged_status != status or last_logged_map != current_map:
                            print(
                                f"Mapa atual: {current_map} (score={current_map_score:.3f}, threshold={float(args.map_threshold):.2f})"
                            )
                            last_logged_status = status
                            last_logged_map = current_map
                    else:
                        status = "unknown"
                        if last_logged_status != status:
                            score_txt = f"{new_score:.3f}" if isinstance(new_score, (int, float)) else "n/a"
                            print(
                                f"Mapa atual: (não reconhecido) (best_score={score_txt}, threshold={float(args.map_threshold):.2f})"
                            )
                            last_logged_status = status
                            last_logged_map = None

                should_trigger = present and (not last_present) and (now - last_capture_ts >= float(args.cooldown))
                last_present = present

                if should_trigger:
                    last_capture_ts = now
                    print(f"Detectado Registro de Item (score={score:.3f} at {loc}). Capturando...")

                    clean_now = bool(args.clean and not cleaned_once)
                    if clean_now:
                        cleaned_once = True

                    run_once(
                        cfg,
                        args,
                        frame_bgr=frame,
                        clean=clean_now,
                        forced_map=current_map,
                        forced_map_score=current_map_score,
                    )

                time.sleep(max(0.05, float(args.interval)))
        except KeyboardInterrupt:
            print("Watch finalizado.")
            drops_log_p = Path(str(getattr(args, "drops_log", "") or "").strip())
            if drops_log_p and drops_log_p.exists():
                print("\n=== Estatísticas acumuladas (todos os mapas) ===")
                print_drop_stats(drops_log_p)
        finally:
            if args.show:
                cv2.destroyAllWindows()
        return

    run_once(cfg, args)

    if args.show:
        cv2.waitKey(0)
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
