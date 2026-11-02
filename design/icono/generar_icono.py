# Icono genérico de la suite: cuatro fichas de juego en los colores de la
# marca, cada una con un guiño a un juego (A = ¡Stop!, X = Triki,
# puntos = Dominó, caja = Puntos y Cajas), con destellos de "diversión".
CREAM = '#fffdf8'; INK = '#1f2a44'

def glyph(kind, color):
    sw = 19
    if kind == 'A':
        return (f'<path d="M-36 46 L0 -46 L36 46" fill="none" stroke="{color}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"/>'
                f'<path d="M-21 12 L21 12" stroke="{color}" stroke-width="{sw}" stroke-linecap="round"/>')
    if kind == 'X':
        return (f'<path d="M-32 -32 L32 32 M32 -32 L-32 32" stroke="{color}" stroke-width="{sw+2}" stroke-linecap="round"/>')
    if kind == 'pips':
        return (f'<circle cx="-28" cy="-28" r="17" fill="{color}"/><circle cx="0" cy="0" r="17" fill="{color}"/>'
                f'<circle cx="28" cy="28" r="17" fill="{color}"/>')
    if kind == 'box':
        d = 34
        return (f'<rect x="{-d}" y="{-d}" width="{2*d}" height="{2*d}" fill="none" stroke="{color}" stroke-width="{sw-5}" stroke-linejoin="round"/>'
                f'<rect x="{-d}" y="{-d}" width="{2*d}" height="{2*d}" fill="{color}" fill-opacity="0.28"/>'
                + ''.join(f'<circle cx="{x}" cy="{y}" r="11" fill="{color}"/>' for x in (-d, d) for y in (-d, d)))
    return ''

def svg(variant):
    bg_rx = {'rounded': 112, 'full': 0, 'maskable': 0, 'small': 116}[variant]
    scale = {'rounded': 1.0, 'full': 0.95, 'maskable': 0.76, 'small': 1.16}[variant]
    small = variant == 'small'
    T = 156; G = 22  # tamaño de ficha y separación
    off = (T + G) / 2
    tiles = [  # (dx, dy, color, glifo, color glifo, giro propio)
        (-off, -off, '#e0464a', 'A', CREAM, -6),
        ( off, -off, '#f2c443', 'X', INK, 5),
        (-off,  off, '#3567c4', 'pips', CREAM, 4),
        ( off,  off, '#3fae70', 'box', CREAM, -5),
    ]
    s = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#26365f"/><stop offset="1" stop-color="#0f172c"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.45" r="0.55">
      <stop offset="0" stop-color="#7d8fd6" stop-opacity="0.45"/><stop offset="1" stop-color="#7d8fd6" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.32"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <filter id="sh" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="{8 if small else 12}" stdDeviation="{6 if small else 10}" flood-color="#02050d" flood-opacity="0.5"/>
    </filter>
  </defs>
  <rect width="512" height="512" rx="{bg_rx}" fill="url(#bg)"/>
  <rect width="512" height="512" rx="{bg_rx}" fill="url(#glow)"/>
  <g transform="translate(256 256) scale({scale}) rotate(-8)">'''
    for dx, dy, col, kind, gcol, r in tiles:
        s += f'''
    <g transform="translate({dx} {dy}) rotate({r})">
      <rect x="{-T/2}" y="{-T/2}" width="{T}" height="{T}" rx="34" fill="{col}" filter="url(#sh)"/>
      <rect x="{-T/2}" y="{-T/2}" width="{T}" height="{T}" rx="34" fill="url(#shine)"/>
      {'' if small else glyph(kind, gcol)}
    </g>'''
    s += '\n  </g>'
    if not small:
        def star(cx, cy, r, color, op=1):
            k = r * 0.22
            return (f'<path d="M{cx} {cy-r} Q{cx+k} {cy-k} {cx+r} {cy} Q{cx+k} {cy+k} {cx} {cy+r} '
                    f'Q{cx-k} {cy+k} {cx-r} {cy} Q{cx-k} {cy-k} {cx} {cy-r} Z" fill="{color}" fill-opacity="{op}"/>')
        f = {'rounded': 1, 'full': 0.97, 'maskable': 0.8}[variant]
        c = lambda v: 256 + (v - 256) * f
        s += '\n  ' + star(c(436), c(72), 30 * f, '#f2c443')
        s += '\n  ' + star(c(70), c(446), 22 * f, '#ffffff', 0.9)
        s += '\n  ' + star(c(462), c(150), 11 * f, '#ffffff', 0.65)
    s += '\n</svg>\n'
    return s

for v in ['rounded', 'full', 'maskable', 'small']:
    open(f'icon-{v}.svg', 'w').write(svg(v))
print('ok')
