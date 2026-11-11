#!/usr/bin/env python3
"""Throwaway discovery probe (scope guard: analysis script, not product code).

One GET per candidate homepage, like a visitor opening the site once: records final URL,
status, title, generator/stack hints, and marketing claims (customer counts, prices,
template counts). Claims are stored as [CLAIMED] evidence, never as facts.
Politeness (R8): robots.txt checked for "/", >= 1.5 s between requests, no retries.

  python3 probe-homepages.py candidates.txt > probe.jsonl
candidates.txt: one "code<TAB>name<TAB>url" per line.
"""
import json, re, sys, time, urllib.parse, urllib.request, urllib.robotparser
from datetime import datetime, timedelta, timezone

UA = "Mozilla/5.0 (Linux; Android 14; SM-A356E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36"
WIB = timezone(timedelta(hours=7))
CLAIM = re.compile(r"(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?\s?(?:rb|ribu|jt|juta|k|K))\s?\+?\s?(pasangan|pengguna|user|undangan|klien|client|customer|pelanggan|tamu|acara|event)", re.I)
PRICE = re.compile(r"Rp\.?\s?\d{1,3}(?:[.,]\d{3})+", re.I)
COUNT = re.compile(r"(\d{2,4})\+?\s?(tema|template|desain|design|themes)", re.I)
STACK = {
    "wordpress": r"wp-content|wp-includes", "elementor": r"elementor", "next": r"/_next/|__NEXT_DATA__|self\.__next_f",
    "nuxt": r"/_nuxt/|__NUXT__", "laravel": r"laravel_session|csrf-token", "livewire": r"livewire",
    "react": r"data-reactroot|react-dom", "vue": r"data-v-[0-9a-f]{6}", "flutter": r"flutter\.js|main\.dart\.js",
    "jquery": r"jquery(\.min)?\.js", "bootstrap": r"bootstrap(\.min)?\.(css|js)", "tailwind": r"tailwind",
    "gsap": r"gsap(\.min)?\.js|ScrollTrigger", "aos": r"aos(\.min)?\.(css|js)|data-aos", "swiper": r"swiper",
    "lottie": r"lottie", "three": r"three(\.min)?\.js", "cloudflare": r"cdn-cgi|cloudflare", "gtm": r"googletagmanager",
    "meta-pixel": r"connect\.facebook\.net|fbq\(", "tiktok-pixel": r"analytics\.tiktok\.com", "midtrans": r"midtrans",
    "xendit": r"xendit", "whatsapp-cta": r"wa\.me/|api\.whatsapp\.com",
}

def robots_ok(url):
    """Fetch robots.txt with the same browser UA (RobotFileParser.read() uses urllib's default UA,
    which bot protection answers with 401/403 — and the parser then treats the whole site as
    disallowed). A 4xx/5xx or network error on robots.txt means "no robots.txt" per RFC 9309 §2.3.1.3."""
    parts = urllib.parse.urlsplit(url)
    robots_url = f"{parts.scheme}://{parts.netloc}/robots.txt"
    try:
        req = urllib.request.Request(robots_url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=15) as resp:
            text = resp.read(500_000).decode("utf-8", "replace")
    except Exception:
        return True
    rp = urllib.robotparser.RobotFileParser()
    rp.parse(text.splitlines())
    return rp.can_fetch("*", url)

def probe(code, name, url):
    rec = {"code": code, "name": name, "url": url, "observed_at_wib": datetime.now(WIB).isoformat(timespec="seconds")}
    if not robots_ok(url):
        rec["skipped"] = "robots.txt disallows /"
        return rec
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "id-ID,id;q=0.9"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read(1_500_000).decode("utf-8", "replace")
            rec.update(status=resp.status, final_url=resp.geturl(), bytes=len(body))
    except Exception as exc:  # recorded, not retried
        rec["error"] = f"{type(exc).__name__}: {str(exc)[:120]}"
        return rec
    title = re.search(r"<title[^>]*>(.*?)</title>", body, re.S | re.I)
    desc = re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']{0,300})', body, re.I)
    rec["title"] = re.sub(r"\s+", " ", title.group(1)).strip()[:140] if title else None
    rec["description"] = desc.group(1).strip()[:220] if desc else None
    rec["claims"] = sorted({" ".join(m.groups()) for m in CLAIM.finditer(body)})[:8]
    rec["prices"] = sorted({p.replace(" ", "") for p in PRICE.findall(body)})[:12]
    rec["template_counts"] = sorted({" ".join(m.groups()) for m in COUNT.finditer(body)})[:6]
    rec["stack"] = [k for k, pat in STACK.items() if re.search(pat, body, re.I)]
    return rec

def main():
    last = {}
    for line in open(sys.argv[1], encoding="utf-8"):
        if not line.strip() or line.startswith("#"):
            continue
        code, name, url = line.rstrip("\n").split("\t")
        host = urllib.parse.urlsplit(url).netloc
        wait = 1.5 - (time.time() - last.get(host, 0))
        if wait > 0:
            time.sleep(wait)
        print(json.dumps(probe(code, name, url), ensure_ascii=False), flush=True)
        last[host] = time.time()
        time.sleep(0.4)

if __name__ == "__main__":
    main()
