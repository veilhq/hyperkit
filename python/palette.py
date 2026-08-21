"""
Palette math and gradient map presets — shared across the hyper ecosystem.

Pure color-space conversions (hex ↔ OKLCh, hex ↔ HSL) and static preset data.
No app state, no logging, no UI concerns.

Consumers: .hyperfield/hyperfield.py, .hyperagent/bridge_api.py
"""

import math


# ---------------------------------------------------------------------------
# Palette math (OKLCH color space — perceptually uniform)
# ---------------------------------------------------------------------------

def build_palette_oklch(hex_color, mode):
    """Derive warm/cool/comp using OKLCH color space (perceptually uniform)."""

    # --- Conversion utilities ---
    def multiply_matrix3(m, v):
        return [
            m[0]*v[0] + m[1]*v[1] + m[2]*v[2],
            m[3]*v[0] + m[4]*v[1] + m[5]*v[2],
            m[6]*v[0] + m[7]*v[1] + m[8]*v[2],
        ]

    def srgb_to_linear(c):
        if abs(c) <= 0.04045:
            return c / 12.92
        return (-1 if c < 0 else 1) * (((abs(c) + 0.055) / 1.055) ** 2.4)

    def linear_to_srgb(c):
        if abs(c) > 0.0031308:
            return (-1 if c < 0 else 1) * (1.055 * (abs(c) ** (1 / 2.4)) - 0.055)
        return 12.92 * c

    M_SRGB_TO_XYZ = [
        0.41239079926595934, 0.357584339383878,   0.1804807884018343,
        0.21263900587151027, 0.715168678767756,   0.07219231536073371,
        0.01933081871559182, 0.11919477979462598, 0.9505321522496607,
    ]
    M_XYZ_TO_SRGB = [
         3.2409699419045226,  -1.537383177570094,   -0.4986107602930034,
        -0.9692436362808796,   1.8759675015077202,   0.04155505740717559,
         0.05563007969699366, -0.20397695888897652,  1.0569715142428786,
    ]
    M_XYZ_TO_LMS = [
        0.8190224379967030, 0.3619062600528904, -0.1288737815209879,
        0.0329836539323885, 0.9292868615863434,  0.0361446663506424,
        0.0481771893596242, 0.2642395317527308,  0.6335478284694309,
    ]
    M_LMS_TO_OKLAB = [
        0.2104542683093140,  0.7936177747023054, -0.0040720430116193,
        1.9779985324311684, -2.4285922420485799,  0.4505937096174110,
        0.0259040424655478,  0.7827717124575296, -0.8086757549230774,
    ]
    M_OKLAB_TO_LMS = [
        1,  0.3963377773761749,  0.2158037573099136,
        1, -0.1055613458156586, -0.0638541728258133,
        1, -0.0894841775298119, -1.2914855480194092,
    ]
    M_LMS_TO_XYZ = [
         1.2268798758459243, -0.5578149944602171,  0.2813910456659647,
        -0.0405757452148008,  1.1122868032803170, -0.0717110580655164,
        -0.0763729366746601, -0.4214933324022432,  1.5869240198367816,
    ]

    def hex_to_oklch(hex_str):
        r = int(hex_str[1:3], 16) / 255
        g = int(hex_str[3:5], 16) / 255
        b = int(hex_str[5:7], 16) / 255
        lin = [srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b)]
        xyz = multiply_matrix3(M_SRGB_TO_XYZ, lin)
        lms = multiply_matrix3(M_XYZ_TO_LMS, xyz)
        lms_cbrt = [math.copysign(abs(x) ** (1/3), x) if x != 0 else 0 for x in lms]
        lab = multiply_matrix3(M_LMS_TO_OKLAB, lms_cbrt)
        L = lab[0]
        a, b_val = lab[1], lab[2]
        C = math.sqrt(a*a + b_val*b_val)
        H = 0 if (abs(a) < 0.0002 and abs(b_val) < 0.0002) else (math.degrees(math.atan2(b_val, a)) % 360)
        return (L, C, H)

    def oklch_to_srgb(l, c, h):
        h_rad = math.radians(h)
        a = c * math.cos(h_rad)
        b_val = c * math.sin(h_rad)
        lms_cbrt = multiply_matrix3(M_OKLAB_TO_LMS, [l, a, b_val])
        lms = [x*x*x for x in lms_cbrt]
        xyz = multiply_matrix3(M_LMS_TO_XYZ, lms)
        lin_rgb = multiply_matrix3(M_XYZ_TO_SRGB, xyz)
        return [linear_to_srgb(lin_rgb[0]), linear_to_srgb(lin_rgb[1]), linear_to_srgb(lin_rgb[2])]

    def in_gamut(rgb):
        return all(-0.001 <= ch <= 1.001 for ch in rgb)

    def oklch_to_hex(l, c, h):
        rgb = oklch_to_srgb(l, c, h)
        if not in_gamut(rgb):
            lo, hi = 0.0, c
            for _ in range(20):
                mid = (lo + hi) / 2
                rgb = oklch_to_srgb(l, mid, h)
                if in_gamut(rgb):
                    lo = mid
                else:
                    hi = mid
            rgb = oklch_to_srgb(l, lo, h)
        rgb = [max(0, min(1, ch)) for ch in rgb]
        return "#{:02x}{:02x}{:02x}".format(
            round(rgb[0] * 255), round(rgb[1] * 255), round(rgb[2] * 255))

    # --- Palette derivation ---
    L, C, H = hex_to_oklch(hex_color)
    L = max(L, 0.55)

    if mode == "triadic":
        warm = oklch_to_hex(min(L * 0.9, 0.8), C, (H + 120) % 360)
        cool = oklch_to_hex(L * 0.8, C * 0.95, (H + 240) % 360)
        comp = oklch_to_hex(L * 0.7, C * 0.85, (H + 180) % 360)
    elif mode == "analogous":
        warm = oklch_to_hex(min(L * 0.95, 0.8), C, (H + 30) % 360)
        cool = oklch_to_hex(L * 0.85, C * 0.95, (H + 60) % 360)
        comp = oklch_to_hex(L * 0.75, C * 0.9, (H + 330) % 360)
    elif mode == "square":
        warm = oklch_to_hex(min(L * 0.9, 0.8), C, (H + 90) % 360)
        cool = oklch_to_hex(L * 0.8, C * 0.95, (H + 180) % 360)
        comp = oklch_to_hex(L * 0.7, C * 0.85, (H + 270) % 360)
    elif mode == "complement":
        warm = oklch_to_hex(min(L * 0.9, 0.8), C, (H + 180) % 360)
        cool = oklch_to_hex(L * 0.7, C * 0.85, (H + 180) % 360)
        comp = oklch_to_hex(L * 0.6, C * 0.6, H)
    else:  # split
        warm = oklch_to_hex(min(L * 0.9, 0.8), C, (H + 150) % 360)
        cool = oklch_to_hex(L * 0.8, C * 0.95, (H + 210) % 360)
        comp = oklch_to_hex(L * 0.7, C * 0.85, (H + 180) % 360)

    return {"accent": hex_color, "warm": warm, "cool": cool, "comp": comp}


# ---------------------------------------------------------------------------
# Palette math (HSL color space — mirrors hypervisor theme.js)
# ---------------------------------------------------------------------------

def build_palette_hsl(hex_color, mode):
    """Derive warm/cool/comp from accent + palette mode (HSL-based, mirrors hypervisor theme.js)."""
    r, g, b = int(hex_color[1:3], 16), int(hex_color[3:5], 16), int(hex_color[5:7], 16)
    r1, g1, b1 = r / 255, g / 255, b / 255
    mx, mn = max(r1, g1, b1), min(r1, g1, b1)
    l = (mx + mn) / 2
    if mx == mn:
        h = s = 0.0
    else:
        d = mx - mn
        s = d / (2 - mx - mn) if l > 0.5 else d / (mx + mn)
        if mx == r1:
            h = ((g1 - b1) / d + (6 if g1 < b1 else 0)) / 6
        elif mx == g1:
            h = ((b1 - r1) / d + 2) / 6
        else:
            h = ((r1 - g1) / d + 4) / 6
    h *= 360

    def hsl_to_hex(hh, ss, ll):
        hh = ((hh % 360) + 360) % 360
        c = (1 - abs(2 * ll - 1)) * ss
        x = c * (1 - abs((hh / 60) % 2 - 1))
        m = ll - c / 2
        if hh < 60:     rr, gg, bb = c, x, 0
        elif hh < 120:  rr, gg, bb = x, c, 0
        elif hh < 180:  rr, gg, bb = 0, c, x
        elif hh < 240:  rr, gg, bb = 0, x, c
        elif hh < 300:  rr, gg, bb = x, 0, c
        else:           rr, gg, bb = c, 0, x
        return "#{:02x}{:02x}{:02x}".format(
            round((rr + m) * 255), round((gg + m) * 255), round((bb + m) * 255))

    if mode == "triadic":
        warm = hsl_to_hex(h + 120, min(s * 1.1, 1), min(l * 1.15, 0.75))
        cool = hsl_to_hex(h + 240, min(s * 0.9, 1), min(l * 0.95, 0.65))
        comp = hsl_to_hex(h + 180, s * 0.7, min(l * 0.85, 0.55))
    elif mode == "analogous":
        warm = hsl_to_hex(h + 30, min(s * 1.05, 1), min(l * 1.1, 0.75))
        cool = hsl_to_hex(h + 60, min(s * 0.9, 1), min(l * 0.95, 0.65))
        comp = hsl_to_hex(h - 30, s * 0.85, min(l * 0.9, 0.6))
    elif mode == "square":
        warm = hsl_to_hex(h + 90, min(s * 1.1, 1), min(l * 1.1, 0.75))
        cool = hsl_to_hex(h + 180, min(s * 0.9, 1), min(l * 0.95, 0.65))
        comp = hsl_to_hex(h + 270, s * 0.8, min(l * 0.85, 0.55))
    elif mode == "complement":
        warm = hsl_to_hex(h + 180, min(s * 1.1, 1), min(l * 1.2, 0.75))
        cool = hsl_to_hex(h + 180, min(s * 0.7, 1), min(l * 0.7, 0.5))
        comp = hsl_to_hex(h, s * 0.5, min(l * 0.6, 0.4))
    else:  # split
        warm = hsl_to_hex(h + 150, min(s * 1.1, 1), min(l * 1.15, 0.75))
        cool = hsl_to_hex(h + 210, min(s * 0.9, 1), min(l * 0.95, 0.65))
        comp = hsl_to_hex(h + 180, s * 0.7, min(l * 0.85, 0.55))

    return {"accent": hex_color, "warm": warm, "cool": cool, "comp": comp}


# ---------------------------------------------------------------------------
# Gradient map presets (mirrors theme.js GRADIENT_MAPS)
# ---------------------------------------------------------------------------

GRADIENT_MAPS = {
    "frost2": {"accent": "#d2ebfe", "warm": "#c0caff", "cool": "#ceb0e4", "comp": "#ff0059",
               "semantics": {"success": "#1dff7d", "warning": "#fdca18", "error": "#fb110b", "info": "#1be1fd"}},
    "cyberdeck": {"accent": "#00ff9f", "warm": "#ffe600", "cool": "#00e5ff", "comp": "#ff003c",
                  "semantics": {"success": "#1efea0", "warning": "#fee51b", "error": "#fc113e", "info": "#1de5fe"}},
    "thermal": {"accent": "#ffc250", "warm": "#fb5a46", "cool": "#5480c7", "comp": "#d10054",
                "semantics": {"success": "#21ff7b", "warning": "#fdca18", "error": "#fd1369", "info": "#086ffd"}},
    "tundra": {"accent": "#d2ebfe", "warm": "#c0caff", "cool": "#ceb0e4", "comp": "#c8ff5c",
               "semantics": {"success": "#bffe1c", "warning": "#fdb015", "error": "#fd154c", "info": "#1be1fd"}},
    "cryo": {"accent": "#d2ebfe", "warm": "#c8d8ff", "cool": "#c0b8e8", "comp": "#a855f7",
             "semantics": {"success": "#1efea1", "warning": "#fdb015", "error": "#fd154c", "info": "#a01efd"}},
    "nordic": {"accent": "#b8ccd8", "warm": "#a8b8c8", "cool": "#c0d0dc", "comp": "#ffb000",
               "semantics": {"success": "#1dfd91", "warning": "#fdb015", "error": "#fc5c0d", "info": "#0f9afc"}},
    "frostbite": {"accent": "#c2e8ff", "warm": "#a0d0f0", "cool": "#8ac0e8", "comp": "#00c0ff",
                  "semantics": {"success": "#1efea1", "warning": "#fdb015", "error": "#fd154c", "info": "#15bffc"}},
    "hazmat": {"accent": "#c8ff00", "warm": "#ffea00", "cool": "#00ff88", "comp": "#ff00cc",
               "semantics": {"success": "#c8fe1c", "warning": "#ffea1c", "error": "#fe13cb", "info": "#15c1fd"}},
    "laser": {"accent": "#00ff41", "warm": "#ff0044", "cool": "#0044ff", "comp": "#8b00ff",
              "semantics": {"success": "#1dfd46", "warning": "#ffea1c", "error": "#fc1145", "info": "#1f5efc"}},
    "prism": {"accent": "#ff2020", "warm": "#ffea00", "cool": "#00e0ff", "comp": "#ff00e5",
              "semantics": {"success": "#1dfd49", "warning": "#ffea1c", "error": "#fd151a", "info": "#1adffd"}},
    "emergency": {"accent": "#ff5500", "warm": "#ffd500", "cool": "#00ff44", "comp": "#ff003c",
                  "semantics": {"success": "#1dfd49", "warning": "#fdd419", "error": "#fc113e", "info": "#15c1fd"}},
    "ignite": {"accent": "#4a4a4a", "warm": "#ff6600", "cool": "#ffea00", "comp": "#ff003c",
               "semantics": {"success": "#1dfd49", "warning": "#ffea1c", "error": "#fc113e", "info": "#15c1fd"}},
    "bloom": {"accent": "#4a4a4a", "warm": "#ff00d4", "cool": "#a855f7", "comp": "#ff77e9",
              "semantics": {"success": "#1dfe8a", "warning": "#ffea1c", "error": "#fe18d3", "info": "#a01efd"}},
    "verdigris": {"accent": "#4a4a4a", "warm": "#00ff88", "cool": "#00e0ff", "comp": "#c8ff00",
                  "semantics": {"success": "#1dfe8a", "warning": "#fdca18", "error": "#fd154c", "info": "#1adffd"}},
    "spectra": {"accent": "#4a4a4a", "warm": "#ff2020", "cool": "#00e0ff", "comp": "#c8ff00",
                "semantics": {"success": "#c8fe1c", "warning": "#ffea1c", "error": "#fd151a", "info": "#1adffd"}},
    "coldsnap": {"accent": "#4a4a4a", "warm": "#7cffb0", "cool": "#7a8cff", "comp": "#c0a0ff",
                 "semantics": {"success": "#1dfd95", "warning": "#ffea1c", "error": "#fd154c", "info": "#5155fd"}},
}
