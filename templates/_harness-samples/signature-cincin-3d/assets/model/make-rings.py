"""Reproduces rings.gltf (own work): two interlocking tori as one glTF 2.0 primitive with an embedded buffer.

Deterministic: `python3 make-rings.py` rewrites rings.gltf byte for byte. Read by template.js (POSITION, NORMAL, uint16).
"""
import base64
import json
import math
import struct


def torus(major, minor, segments, sides, center, tilt):
    positions, normals, indices = [], [], []
    ct, st = math.cos(tilt), math.sin(tilt)
    for i in range(segments + 1):
        u = 2 * math.pi * i / segments
        for j in range(sides + 1):
            v = 2 * math.pi * j / sides
            nx, ny, nz = math.cos(u) * math.cos(v), math.sin(u) * math.cos(v), math.sin(v)
            x, y, z = (major + minor * math.cos(v)) * math.cos(u), (major + minor * math.cos(v)) * math.sin(u), minor * math.sin(v)
            y2, z2 = y * ct - z * st, y * st + z * ct
            ny2, nz2 = ny * ct - nz * st, ny * st + nz * ct
            positions.append((x + center[0], y2 + center[1], z2 + center[2]))
            normals.append((nx, ny2, nz2))
    for i in range(segments):
        for j in range(sides):
            a = i * (sides + 1) + j
            b = a + sides + 1
            indices += [a, b, a + 1, b, b + 1, a + 1]
    return positions, normals, indices


p1, n1, i1 = torus(0.62, 0.11, 64, 20, (-0.36, 0, 0), 0.0)
p2, n2, i2 = torus(0.62, 0.11, 64, 20, (0.36, 0, 0), math.pi / 2)
offset = len(p1)
positions, normals, indices = p1 + p2, n1 + n2, i1 + [k + offset for k in i2]
pos_bytes = b''.join(struct.pack('<3f', *p) for p in positions)
nor_bytes = b''.join(struct.pack('<3f', *v) for v in normals)
idx_bytes = struct.pack('<%dH' % len(indices), *indices)
buffer = pos_bytes + nor_bytes + idx_bytes + b'\x00' * ((4 - len(idx_bytes) % 4) % 4)
mins = [min(p[k] for p in positions) for k in range(3)]
maxs = [max(p[k] for p in positions) for k in range(3)]

gltf = {
    "asset": {"version": "2.0", "generator": "invitesion harness sample (own work)"},
    "scene": 0,
    "scenes": [{"nodes": [0]}],
    "nodes": [{"mesh": 0, "name": "rings"}],
    "meshes": [{"name": "rings", "primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1}, "indices": 2, "material": 0}]}],
    "materials": [{"name": "rose-gold", "pbrMetallicRoughness": {"baseColorFactor": [0.86, 0.6, 0.5, 1], "metallicFactor": 1, "roughnessFactor": 0.35}}],
    "buffers": [{"byteLength": len(buffer), "uri": "data:application/octet-stream;base64," + base64.b64encode(buffer).decode()}],
    "bufferViews": [
        {"buffer": 0, "byteOffset": 0, "byteLength": len(pos_bytes), "target": 34962},
        {"buffer": 0, "byteOffset": len(pos_bytes), "byteLength": len(nor_bytes), "target": 34962},
        {"buffer": 0, "byteOffset": len(pos_bytes) + len(nor_bytes), "byteLength": len(idx_bytes), "target": 34963},
    ],
    "accessors": [
        {"bufferView": 0, "componentType": 5126, "count": len(positions), "type": "VEC3", "min": mins, "max": maxs},
        {"bufferView": 1, "componentType": 5126, "count": len(normals), "type": "VEC3"},
        {"bufferView": 2, "componentType": 5123, "count": len(indices), "type": "SCALAR"},
    ],
}

with open('rings.gltf', 'w') as out:
    json.dump(gltf, out, separators=(',', ':'))
