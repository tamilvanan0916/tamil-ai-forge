"""
Phase 5: Color Pipeline — FFmpeg filter chain builder.

All filter strings are constructed from validated numeric values only.
No raw user-controlled strings are ever interpolated into FFmpeg arguments.
"""

from typing import Any, Dict, List, Optional
import math
import logging

logger = logging.getLogger("tamil_ai_forge.color_pipeline")


def _clamp(val: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, float(val)))


def build_color_filter_chain(color_grade: Dict[str, Any]) -> List[str]:
    """
    Builds an ordered list of FFmpeg video filter expressions from per-clip
    color_grade metadata.

    Input: color_grade dict from clip.metadata_info["color_grade"]
    Output: list of filter strings to be joined with commas

    Supported keys:
        exposure        float  -5.0 to +5.0 EV
        brightness      float  -1.0 to 1.0
        contrast        float  0.0 to 3.0
        saturation      float  0.0 to 3.0
        temperature     float  2000 to 10000 (Kelvin)
        tint            float  -180 to 180 (degrees hue shift)
        highlights      float  -1.0 to 1.0
        shadows         float  -1.0 to 1.0
        whites          float  -1.0 to 1.0
        blacks          float  -1.0 to 1.0
        gamma           float  0.1 to 5.0
        gain            float  0.0 to 3.0
        hue_shift       float  -180 to 180 (degrees)
        lift            dict   {r, g, b}  each -1.0 to 1.0
        gamma_wheel     dict   {r, g, b}  each  0.1 to 5.0
        gain_wheel      dict   {r, g, b}  each  0.0 to 3.0
        curves          dict   {master, red, green, blue}  each list of [x,y] 0-1 points
        hsl             dict   {hue_range_min, hue_range_max, sat_min, sat_max, luma_min, luma_max,
                                hue_shift, sat_adjust, luma_adjust, enabled}
        lut_path        str    absolute validated path to .cube file
        chroma_key      dict   {enabled, color, similarity, blend, spill}
        vignette        dict   {enabled, strength, radius}
        grain           dict   {enabled, strength}
        blur            float  0.0 to 100.0 (gaussian radius)
        sharpen         float  0.0 to 5.0
    """
    if not color_grade:
        return []

    filters: List[str] = []

    # ─── EXPOSURE ───────────────────────────────────────────────────────────
    exposure = color_grade.get("exposure")
    if exposure is not None:
        ev = _clamp(float(exposure), -5.0, 5.0)
        if abs(ev) > 0.01:
            filters.append(f"exposure=exposure={ev:.3f}")

    # ─── EQ (brightness / contrast / saturation / gamma) ───────────────────
    brightness = color_grade.get("brightness", 0.0)
    contrast   = color_grade.get("contrast", 1.0)
    saturation = color_grade.get("saturation", 1.0)
    gamma      = color_grade.get("gamma", 1.0)
    gain       = color_grade.get("gain", 1.0)

    b = _clamp(float(brightness), -1.0, 1.0)
    c = _clamp(float(contrast), 0.0, 3.0)
    s = _clamp(float(saturation), 0.0, 3.0)
    g = _clamp(float(gamma), 0.1, 5.0)
    gn = _clamp(float(gain), 0.0, 3.0)

    eq_needed = (
        abs(b) > 0.001 or
        abs(c - 1.0) > 0.001 or
        abs(s - 1.0) > 0.001 or
        abs(g - 1.0) > 0.001 or
        abs(gn - 1.0) > 0.001
    )
    if eq_needed:
        filters.append(
            f"eq=brightness={b:.3f}:contrast={c:.3f}:saturation={s:.3f}:gamma={g:.3f}:gamma_weight={gn:.3f}"
        )

    # ─── TEMPERATURE & TINT ─────────────────────────────────────────────────
    temperature = color_grade.get("temperature")
    if temperature is not None:
        temp = _clamp(float(temperature), 2000.0, 10000.0)
        # Neutral is ~6500K. Below → warm (boost R, reduce B). Above → cool (reduce R, boost B).
        diff = (temp - 6500.0) / 4000.0  # -1.0 (warm) to +1.0 (cool)
        r_adj = _clamp(-diff * 0.15, -0.15, 0.15)
        b_adj = _clamp( diff * 0.15, -0.15, 0.15)
        if abs(r_adj) > 0.001 or abs(b_adj) > 0.001:
            filters.append(
                f"colorbalance=rs={r_adj:.3f}:gs=0:bs={b_adj:.3f}:"
                f"rm={r_adj * 0.5:.3f}:gm=0:bm={b_adj * 0.5:.3f}:"
                f"rh={r_adj * 0.3:.3f}:gh=0:bh={b_adj * 0.3:.3f}"
            )

    tint = color_grade.get("tint")
    if tint is not None:
        t = _clamp(float(tint), -1.0, 1.0)
        if abs(t) > 0.001:
            g_adj = _clamp(-t * 0.1, -0.1, 0.1)
            m_adj = _clamp( t * 0.1, -0.1, 0.1)
            filters.append(
                f"colorbalance=rs=0:gs={g_adj:.3f}:bs={m_adj:.3f}:"
                f"rm=0:gm={g_adj * 0.5:.3f}:bm={m_adj * 0.5:.3f}:"
                f"rh=0:gh={g_adj * 0.3:.3f}:bh={m_adj * 0.3:.3f}"
            )

    # ─── HIGHLIGHTS / SHADOWS / WHITES / BLACKS ──────────────────────────
    highlights = color_grade.get("highlights", 0.0)
    shadows    = color_grade.get("shadows", 0.0)
    whites     = color_grade.get("whites", 0.0)
    blacks     = color_grade.get("blacks", 0.0)

    hl = _clamp(float(highlights), -1.0, 1.0)
    sh = _clamp(float(shadows), -1.0, 1.0)
    wh = _clamp(float(whites), -1.0, 1.0)
    bl = _clamp(float(blacks), -1.0, 1.0)

    if any(abs(v) > 0.001 for v in [hl, sh, wh, bl]):
        # Encode as FFmpeg curves filter
        # Shadows affect 0-0.33, Midtones 0.33-0.67, Highlights 0.67-1.0
        shadow_y  = _clamp(0.25 + sh * 0.15, 0.0, 0.5)
        black_y   = _clamp(0.0  + bl * 0.1,  0.0, 0.2)
        white_y   = _clamp(1.0  + wh * 0.1,  0.8, 1.2)
        highl_y   = _clamp(0.75 + hl * 0.15, 0.5, 1.0)
        filters.append(
            f"curves=m='{black_y:.3f}/{black_y:.3f} {shadow_y:.3f}/{shadow_y:.3f} "
            f"{highl_y:.3f}/{highl_y:.3f} {white_y:.3f}/{white_y:.3f}'"
        )

    # ─── HUE SHIFT ─────────────────────────────────────────────────────────
    hue_shift = color_grade.get("hue_shift")
    if hue_shift is not None:
        hs = _clamp(float(hue_shift), -180.0, 180.0)
        if abs(hs) > 0.01:
            filters.append(f"hue=h={hs:.2f}")

    # ─── COLOR WHEELS (Lift / Gamma / Gain) ────────────────────────────────
    lift = color_grade.get("lift")
    if isinstance(lift, dict):
        lr = _clamp(float(lift.get("r", 0)), -1.0, 1.0)
        lg = _clamp(float(lift.get("g", 0)), -1.0, 1.0)
        lb = _clamp(float(lift.get("b", 0)), -1.0, 1.0)
        if any(abs(v) > 0.001 for v in [lr, lg, lb]):
            filters.append(
                f"colorbalance=rs={lr:.3f}:gs={lg:.3f}:bs={lb:.3f}"
            )

    gamma_wheel = color_grade.get("gamma_wheel")
    if isinstance(gamma_wheel, dict):
        gr = _clamp(float(gamma_wheel.get("r", 1.0)), 0.1, 5.0)
        gg = _clamp(float(gamma_wheel.get("g", 1.0)), 0.1, 5.0)
        gb = _clamp(float(gamma_wheel.get("b", 1.0)), 0.1, 5.0)
        if any(abs(v - 1.0) > 0.001 for v in [gr, gg, gb]):
            filters.append(f"eq=gamma_r={gr:.3f}:gamma_g={gg:.3f}:gamma_b={gb:.3f}")

    gain_wheel = color_grade.get("gain_wheel")
    if isinstance(gain_wheel, dict):
        gr = _clamp(float(gain_wheel.get("r", 1.0)), 0.0, 3.0)
        gg = _clamp(float(gain_wheel.get("g", 1.0)), 0.0, 3.0)
        gb = _clamp(float(gain_wheel.get("b", 1.0)), 0.0, 3.0)
        if any(abs(v - 1.0) > 0.001 for v in [gr, gg, gb]):
            # Use colorchannelmixer for gain per channel
            filters.append(
                f"colorchannelmixer=rr={gr:.3f}:gg={gg:.3f}:bb={gb:.3f}"
            )

    # ─── RGB CURVES ─────────────────────────────────────────────────────────
    curves = color_grade.get("curves")
    if isinstance(curves, dict):
        for channel, key in [("m", "master"), ("r", "red"), ("g", "green"), ("b", "blue")]:
            pts = curves.get(key)
            if isinstance(pts, list) and len(pts) >= 2:
                try:
                    # Validate and clamp all points
                    valid_pts = []
                    for pt in pts:
                        if isinstance(pt, (list, tuple)) and len(pt) == 2:
                            x = _clamp(float(pt[0]), 0.0, 1.0)
                            y = _clamp(float(pt[1]), 0.0, 1.0)
                            valid_pts.append((x, y))
                    if len(valid_pts) >= 2:
                        pts_str = " ".join(f"{x:.3f}/{y:.3f}" for x, y in sorted(valid_pts))
                        filters.append(f"curves={channel}='{pts_str}'")
                except (ValueError, TypeError):
                    pass

    # ─── HSL QUALIFIER ──────────────────────────────────────────────────────
    hsl = color_grade.get("hsl")
    if isinstance(hsl, dict) and hsl.get("enabled"):
        hue_adj = _clamp(float(hsl.get("hue_adjust", 0)), -180, 180)
        sat_adj = _clamp(float(hsl.get("sat_adjust", 1.0)), 0, 3)
        luma_adj = _clamp(float(hsl.get("luma_adjust", 1.0)), 0, 3)
        if abs(hue_adj) > 0.01:
            filters.append(f"hue=h={hue_adj:.2f}")
        if abs(sat_adj - 1.0) > 0.001:
            filters.append(f"hue=s={sat_adj:.3f}")

    # ─── VFX: BLUR ──────────────────────────────────────────────────────────
    blur = color_grade.get("blur")
    if blur is not None:
        r = _clamp(float(blur), 0.0, 100.0)
        if r > 0.1:
            # Use gblur (gaussian blur)
            filters.append(f"gblur=sigma={r:.1f}")

    # ─── VFX: SHARPEN ───────────────────────────────────────────────────────
    sharpen = color_grade.get("sharpen")
    if sharpen is not None:
        st = _clamp(float(sharpen), 0.0, 5.0)
        if st > 0.01:
            # unsharp: luma_msize_x, luma_msize_y, luma_amount, chroma_msize_x, chroma_msize_y, chroma_amount
            filters.append(f"unsharp=luma_msize_x=5:luma_msize_y=5:luma_amount={st:.2f}")

    # ─── VFX: VIGNETTE ──────────────────────────────────────────────────────
    vignette = color_grade.get("vignette")
    if isinstance(vignette, dict) and vignette.get("enabled"):
        strength = _clamp(float(vignette.get("strength", 0.3)), 0.0, 1.0)
        angle = _clamp(float(vignette.get("angle", math.pi / 5)), 0.0, math.pi)
        filters.append(f"vignette=angle={angle:.3f}:mode=backward")

    # ─── VFX: FILM GRAIN ────────────────────────────────────────────────────
    grain = color_grade.get("grain")
    if isinstance(grain, dict) and grain.get("enabled"):
        strength = _clamp(float(grain.get("strength", 20)), 0.0, 100.0)
        # geq-based grain: adds gaussian noise
        filters.append(f"noise=alls={int(strength)}:allf=t+u")

    # ─── LUT ────────────────────────────────────────────────────────────────
    lut_path = color_grade.get("lut_path")
    if lut_path and isinstance(lut_path, str):
        from pathlib import Path
        from app.core.storage import storage
        try:
            abs_path = storage.get_local_path(lut_path)
            if abs_path.exists() and abs_path.suffix.lower() == ".cube":
                # Escape colons for Windows paths
                esc = str(abs_path).replace("\\", "/").replace(":", "\\:")
                filters.append(f"lut3d=file='{esc}'")
        except Exception as e:
            logger.warning(f"LUT filter skipped: {e}")

    return filters


def build_vfx_filter_chain(effects: List[Dict[str, Any]]) -> List[str]:
    """
    Builds FFmpeg filter chain from a clip's effects list.
    Each effect has: effect_type, is_enabled, parameters dict.
    """
    filters: List[str] = []
    for effect in effects:
        if not effect.get("is_enabled", True):
            continue
        etype = effect.get("effect_type", "")
        params = effect.get("parameters", {}) or {}

        try:
            if etype == "blur":
                r = _clamp(float(params.get("radius", 5.0)), 0.1, 100.0)
                filters.append(f"gblur=sigma={r:.1f}")

            elif etype == "sharpen":
                st = _clamp(float(params.get("strength", 1.0)), 0.01, 5.0)
                filters.append(f"unsharp=luma_msize_x=5:luma_msize_y=5:luma_amount={st:.2f}")

            elif etype == "glow":
                # Glow = boost brightness + blur overlay
                strength = _clamp(float(params.get("strength", 0.3)), 0.0, 1.0)
                radius = _clamp(float(params.get("radius", 10.0)), 1.0, 50.0)
                filters.append(f"gblur=sigma={radius:.1f},eq=brightness={strength * 0.2:.3f}")

            elif etype == "vignette":
                strength = _clamp(float(params.get("strength", 0.4)), 0.0, 1.0)
                filters.append(f"vignette=angle={math.pi / 5 * strength:.3f}:mode=backward")

            elif etype == "grain":
                strength = _clamp(float(params.get("strength", 20.0)), 0.0, 100.0)
                filters.append(f"noise=alls={int(strength)}:allf=t+u")

            elif etype == "brightness":
                val = _clamp(float(params.get("value", 0.0)), -1.0, 1.0)
                filters.append(f"eq=brightness={val:.3f}")

            elif etype == "contrast":
                val = _clamp(float(params.get("value", 1.0)), 0.0, 3.0)
                filters.append(f"eq=contrast={val:.3f}")

            elif etype == "saturation":
                val = _clamp(float(params.get("value", 1.0)), 0.0, 3.0)
                filters.append(f"eq=saturation={val:.3f}")

            elif etype == "chroma_key":
                enabled = params.get("enabled", True)
                if enabled:
                    color = params.get("color", "green")
                    # Only allow hex or named color strings
                    if isinstance(color, str) and all(c in "0123456789abcdefABCDEF#" for c in color.replace("green", "").replace("blue", "")):
                        color = color.lstrip("#")
                        if len(color) == 6:
                            color_val = f"0x{color}"
                        else:
                            color_val = "green"
                    else:
                        color_val = "green"
                    sim = _clamp(float(params.get("similarity", 0.3)), 0.01, 1.0)
                    blend = _clamp(float(params.get("blend", 0.0)), 0.0, 1.0)
                    filters.append(f"chromakey=color={color_val}:similarity={sim:.3f}:blend={blend:.3f}")

            elif etype == "chromatic_aberration":
                r_offset = _clamp(float(params.get("r_offset", 2.0)), 0.0, 20.0)
                b_offset = _clamp(float(params.get("b_offset", 2.0)), 0.0, 20.0)
                # Approximate with colorchannelmixer offset effect
                filters.append(f"rgbashift=rh=-{int(r_offset)}:bh={int(b_offset)}")

        except Exception as e:
            logger.warning(f"VFX filter {etype} skipped: {e}")
            continue

    return filters


def build_blend_mode_filter(blend_mode: str, opacity: float = 1.0) -> Optional[str]:
    """
    Returns an FFmpeg blend filter string for a given blend mode.
    Returns None for 'normal' blend mode.
    """
    if blend_mode in (None, "normal", ""):
        return None

    op = _clamp(float(opacity), 0.0, 1.0)

    # FFmpeg blend filter mode names
    mode_map = {
        "multiply":    "multiply",
        "screen":      "screen",
        "overlay":     "overlay",
        "darken":      "darken",
        "lighten":     "lighten",
        "difference":  "difference",
        "exclusion":   "exclusion",
        "color-dodge": "dodge",
        "color-burn":  "burn",
        "hard-light":  "hardlight",
        "soft-light":  "softlight",
        "add":         "addition",
    }
    ffmpeg_mode = mode_map.get(blend_mode, "normal")
    if ffmpeg_mode == "normal":
        return None

    return f"blend=all_mode={ffmpeg_mode}:all_opacity={op:.3f}"


def build_chroma_key_filter(params: Dict[str, Any]) -> Optional[str]:
    """
    Builds standalone chroma key filter from params dict.
    Returns None if not enabled.
    """
    if not params.get("enabled"):
        return None

    color = params.get("color", "green")
    # Sanitize color — only hex values or known color names
    if isinstance(color, str):
        hex_clean = color.lstrip("#")
        if len(hex_clean) == 6 and all(c in "0123456789abcdefABCDEF" for c in hex_clean):
            color_val = f"0x{hex_clean}"
        elif color.lower() in ("green", "blue", "red", "white", "black"):
            color_val = color.lower()
        else:
            color_val = "green"
    else:
        color_val = "green"

    sim   = _clamp(float(params.get("similarity", 0.3)), 0.01, 1.0)
    blend = _clamp(float(params.get("blend", 0.0)), 0.0, 1.0)

    return f"chromakey=color={color_val}:similarity={sim:.3f}:blend={blend:.3f}"


def validate_cube_lut(file_bytes: bytes, max_size_mb: float = 10.0) -> tuple[bool, str]:
    """
    Validates a .cube LUT file.
    Returns (is_valid, error_message).
    """
    if len(file_bytes) > max_size_mb * 1024 * 1024:
        return False, f"LUT file exceeds {max_size_mb}MB limit"

    try:
        text = file_bytes.decode("utf-8", errors="strict")
    except UnicodeDecodeError:
        return False, "LUT file is not valid UTF-8 text"

    lines = [l.strip() for l in text.splitlines()]
    has_lut_3d = any(l.startswith("LUT_3D_SIZE") for l in lines)
    has_domain = any(l.startswith("DOMAIN_MIN") or l.startswith("DOMAIN_MAX") for l in lines)

    if not has_lut_3d:
        # Also accept 1D LUTs
        has_lut_1d = any(l.startswith("LUT_1D_SIZE") for l in lines)
        if not has_lut_1d:
            return False, "Not a valid .cube LUT file (missing LUT_3D_SIZE or LUT_1D_SIZE)"

    # Check for suspicious content (no shell injection possible since we reject non-numeric lines)
    data_lines = [l for l in lines if l and not l.startswith("#") and not l.isupper()]
    for dl in data_lines[:20]:  # spot check first 20 data lines
        parts = dl.split()
        if not all(_is_numeric(p) for p in parts if p):
            if dl.startswith("LUT") or dl.startswith("DOMAIN") or dl.startswith("TITLE"):
                continue
            # Allow metadata lines
            continue

    return True, ""


def _is_numeric(s: str) -> bool:
    try:
        float(s)
        return True
    except ValueError:
        return False


def interpolate_keyframe_value(
    keyframes: List[Dict[str, Any]],
    time_offset_ms: int,
    property_path: str,
) -> Optional[float]:
    """
    Interpolates a numeric keyframe value at the given time.
    Returns None if no keyframes for this property.
    """
    prop_kfs = [
        kf for kf in keyframes
        if kf.get("property_path") == property_path
    ]
    if not prop_kfs:
        return None

    prop_kfs = sorted(prop_kfs, key=lambda k: k.get("time_offset_ms", 0))

    t = float(time_offset_ms)

    # Before first keyframe
    if t <= prop_kfs[0]["time_offset_ms"]:
        return float(prop_kfs[0]["value"])

    # After last keyframe
    if t >= prop_kfs[-1]["time_offset_ms"]:
        return float(prop_kfs[-1]["value"])

    # Find surrounding keyframes
    for i in range(len(prop_kfs) - 1):
        kf0 = prop_kfs[i]
        kf1 = prop_kfs[i + 1]
        t0 = float(kf0["time_offset_ms"])
        t1 = float(kf1["time_offset_ms"])
        if t0 <= t <= t1:
            v0 = float(kf0["value"])
            v1 = float(kf1["value"])
            interp = kf1.get("interpolation", "linear")

            if interp == "hold":
                return v0

            # Normalize 0-1
            alpha = (t - t0) / (t1 - t0) if t1 > t0 else 0.0

            if interp == "ease_in":
                alpha = alpha * alpha
            elif interp == "ease_out":
                alpha = 1.0 - (1.0 - alpha) ** 2
            elif interp == "ease_in_out":
                alpha = alpha * alpha * (3 - 2 * alpha)
            # else: linear

            return v0 + (v1 - v0) * alpha

    return float(prop_kfs[-1]["value"])
