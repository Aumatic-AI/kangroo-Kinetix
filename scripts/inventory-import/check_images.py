#!/usr/bin/env python3
"""OPTIONAL network step: check every distinct image URL from the normalized JSON.

  python3 -I scripts/inventory-import/check_images.py --in inventory.normalized.json --out image-check.json

HEAD first; falls back to GET with Range: bytes=0-0 (body not downloaded) when HEAD fails/is refused.
10s timeout per socket operation (connect/read), max 8 concurrent, polite User-Agent, redirects followed
(max 5), no retry storm: a 429/503 triggers a host-wide pause (Retry-After, capped at 30s) and ONE
re-attempt; if still limited the URL is reported as 'unchecked', never 'broken'.
Statuses: ok | ok_generic_content_type (2xx, application/octet-stream but image file extension) | broken (4xx) | non_image (2xx, other non-image content-type) | unreachable (network/5xx) | unchecked.
"""
import argparse, json, threading, time, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

UA = 'KangroooInventoryImageCheck/1.0 (+internal one-off import validation; contact: teja@aumatic.ai)'
TIMEOUT = 10
_lock = threading.Lock()
_pause_until = {}


class _Redir(urllib.request.HTTPRedirectHandler):
    max_redirections = 5


OPENER = urllib.request.build_opener(_Redir)


def wait_host(host):
    while True:
        with _lock:
            d = _pause_until.get(host, 0) - time.time()
        if d <= 0:
            return
        time.sleep(min(d, 1))


def pause_host(host, secs):
    with _lock:
        _pause_until[host] = max(_pause_until.get(host, 0), time.time() + secs)


def attempt(url, method):
    headers = {'User-Agent': UA, 'Accept': 'image/*,*/*;q=0.5'}
    if method == 'GET':
        headers['Range'] = 'bytes=0-0'
    req = urllib.request.Request(url, headers=headers, method=method)
    try:
        with OPENER.open(req, timeout=TIMEOUT) as r:
            if method == 'GET':
                r.read(1)
            return r.status, r.headers.get('Content-Type'), r.geturl(), None, None
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get('Content-Type') if e.headers else None, url, None, e.headers.get('Retry-After') if e.headers else None
    except Exception as e:  # noqa
        return None, None, url, '%s: %s' % (type(e).__name__, e), None


IMG_EXT = ('.avif', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg')


def classify(code, ctype, err, url=''):
    if code is None:
        return 'unreachable'
    if code in (429, 503):
        return 'unchecked'
    if 200 <= code < 300:
        if (ctype or '').lower().startswith('image/'):
            return 'ok'
        # host serves a known image extension as a generic binary type: reachable, flag as a warning only
        if (ctype or '').lower().startswith('application/octet-stream') and url.split('#')[0].split('?')[0].lower().endswith(IMG_EXT):
            return 'ok_generic_content_type'
        return 'non_image'
    if 400 <= code < 500:
        return 'broken'
    return 'unreachable'


def check(url):
    host = urllib.parse.urlparse(url).netloc
    req_url = url
    result = None
    for round_ in range(2):
        wait_host(host)
        code, ctype, final, err, ra = attempt(req_url, 'HEAD')
        if code is None or code >= 400:
            if code not in (429, 503):
                code2, ctype2, final2, err2, ra2 = attempt(req_url, 'GET')
                if code2 is not None and (code is None or code2 < 400 or code2 in (429, 503)):
                    code, ctype, final, err, ra = code2, ctype2, final2, err2, ra2
                elif code is None:
                    err = err2 or err
        if code in (429, 503):
            try:
                secs = min(float(ra), 30) if ra else 10
            except ValueError:
                secs = 10
            pause_host(host, secs)
            if round_ == 0:
                continue
        result = (code, ctype, final, err)
        break
    code, ctype, final, err = result
    st = classify(code, ctype, err, url)
    return {'url': url, 'status': st, 'http_status': code, 'content_type': ctype,
            'final_url': final if final != req_url else None, 'error': err}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--in', dest='inp', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--resume', help='previous results JSON: keep ok/ok_generic_content_type/broken, re-check the rest')
    ap.add_argument('--delay', type=float, default=0.0, help='seconds each worker sleeps before a request')
    a = ap.parse_args()
    d = json.load(open(a.inp, encoding='utf-8'))
    urls = {i['url'] for i in d['images']}
    urls |= {x['url'] for x in d['legacy'] if x['kind'] == 'image_post' and x.get('url')}
    urls = sorted(urls)
    print('checking %d distinct URLs' % len(urls), flush=True)
    kept = []
    if a.resume:
        prev = json.load(open(a.resume, encoding='utf-8'))['results']
        kept = [r for r in prev if r['status'] in ('ok', 'ok_generic_content_type', 'broken') and r['url'] in set(urls)]
        done = {r['url'] for r in kept}
        urls = [u for u in urls if u not in done]
        print('resume: kept %d, re-checking %d' % (len(kept), len(urls)), flush=True)

    def run(u):
        if a.delay:
            time.sleep(a.delay)
        return check(u)

    with ThreadPoolExecutor(max_workers=8) as ex:
        results = kept + list(ex.map(run, urls))
    results.sort(key=lambda r: r['url'])
    print('total results: %d' % len(results))
    summary = {}
    for r in results:
        summary[r['status']] = summary.get(r['status'], 0) + 1
    json.dump({'user_agent': UA, 'summary': summary, 'results': results}, open(a.out, 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1, sort_keys=True)
    print(summary)


if __name__ == '__main__':
    main()
