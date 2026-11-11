"""Reproduces chime.wav (own work): a 14 s pentatonic chime over a soft two-note pad, 16 kHz mono PCM16.

Deterministic (no randomness, no samples or recordings): `python3 make-chime.py` rewrites chime.wav byte for byte.
"""
import math
import struct
import wave

RATE, SECONDS = 16000, 14
NOTES = [(0.0, 523.25), (1.6, 659.25), (3.2, 783.99), (4.8, 880.00), (6.4, 783.99), (8.0, 659.25), (9.6, 587.33), (11.2, 523.25)]
PAD = [(261.63, 0.05), (392.00, 0.035)]

samples = []
for i in range(RATE * SECONDS):
    t = i / RATE
    value = sum(a * math.sin(2 * math.pi * f * t) * (0.6 + 0.4 * math.sin(2 * math.pi * 0.1 * t)) for f, a in PAD)
    for start, f in NOTES:
        dt = t - start
        if 0 <= dt < 3.0:
            envelope = min(1.0, dt / 0.02) * math.exp(-dt * 1.6)
            value += 0.16 * envelope * (math.sin(2 * math.pi * f * dt) + 0.3 * math.sin(2 * math.pi * 2 * f * dt))
    fade = min(1.0, t / 1.0, (SECONDS - t) / 1.5)
    samples.append(int(max(-1, min(1, value * fade)) * 32767 * 0.8))

with wave.open('chime.wav', 'wb') as out:
    out.setnchannels(1)
    out.setsampwidth(2)
    out.setframerate(RATE)
    out.writeframes(struct.pack('<%dh' % len(samples), *samples))
